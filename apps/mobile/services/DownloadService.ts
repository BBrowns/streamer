import * as FileSystem from "expo-file-system/legacy";
import { Platform, Alert } from "react-native";
import {
  useDownloadStore,
  type DownloadMediaItem,
  type DownloadPlaybackSessionContext,
  type DownloadStatus,
} from "../stores/downloadStore";
import { usePlaybackSessionStore } from "../stores/playbackSessionStore";
import type { MediaInfo } from "../stores/playerStore";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import type { Stream } from "@streamer/shared";
import { api } from "./api";
import type {
  DesktopDownloadJob,
  DesktopDownloadJobStatus,
} from "./desktop-bridge";
import {
  getDownloadEligibility,
  type DownloadEligibility,
} from "./downloadEligibility";
import {
  cancelPlaybackSession,
  completePlaybackSession,
  failPlaybackSession,
} from "./playback/PlaybackSessionPlaybackService";
import {
  createPlaybackRuntimeError,
  inferPlaybackErrorCodeFromMessages,
} from "./playback/PlaybackErrors";

export {
  getDownloadEligibility,
  type DownloadEligibility,
  type DownloadEligibilityMode,
} from "./downloadEligibility";

export interface DownloadStartOptions {
  resolvedUrl?: string;
  eligibility?: DownloadEligibility;
  playbackSession?: DownloadPlaybackSessionContext;
}

export function mapDesktopDownloadStatus(
  status?: DesktopDownloadJobStatus,
): DownloadStatus {
  switch (status) {
    case "Pending":
      return "Preparing";
    case "Completed":
      return "Completed";
    case "Paused":
      return "Paused";
    case "Error":
    case "Canceled":
      return "Error";
    case "Downloading":
    default:
      return "Downloading";
  }
}

export class DownloadService {
  private downloadResumables: Record<string, FileSystem.DownloadResumable> = {};
  private desktopProgressUnsubscribe: (() => void) | null = null;
  private lastSessionProgressBucket: Record<string, number> = {};
  private finalizingTasks = new Set<string>();

  private getSessionContext(
    id: string,
    fallback?: DownloadPlaybackSessionContext,
  ) {
    return useDownloadStore.getState().tasks[id]?.playbackSession || fallback;
  }

  private setSessionStatus(
    playbackSession: DownloadPlaybackSessionContext | undefined,
    status: "downloading" | "verifying_download",
    reason?: string,
  ) {
    if (!playbackSession) return;
    const store = usePlaybackSessionStore.getState();
    const session = store.sessions[playbackSession.sessionId];
    if (
      !session ||
      session.status === "completed" ||
      session.status === "failed" ||
      session.status === "cancelled" ||
      session.status === status
    ) {
      return;
    }

    store.dispatchPlaybackEvent(playbackSession.sessionId, {
      type: "status_changed",
      from: session.status,
      to: status,
      reason,
    });
  }

  private recordSessionProgress(
    id: string,
    progress: number,
    totalBytesWritten: number,
    totalBytesExpectedToWrite: number,
  ) {
    const playbackSession = this.getSessionContext(id);
    if (!playbackSession) return;

    const normalizedProgress = Math.max(0, Math.min(progress || 0, 1));
    const bucket = Math.floor(normalizedProgress * 20);
    if (
      normalizedProgress < 1 &&
      this.lastSessionProgressBucket[id] === bucket
    ) {
      return;
    }

    this.lastSessionProgressBucket[id] = bucket;
    const session =
      usePlaybackSessionStore.getState().sessions[playbackSession.sessionId];
    if (
      !session ||
      session.status === "completed" ||
      session.status === "failed" ||
      session.status === "cancelled"
    ) {
      return;
    }

    usePlaybackSessionStore
      .getState()
      .recordDownloadProgress(
        playbackSession.sessionId,
        normalizedProgress,
        Math.max(0, Math.round(totalBytesWritten || 0)),
        Math.max(0, Math.round(totalBytesExpectedToWrite || 0)),
      );
  }

  private failSession(
    id: string,
    error: unknown,
    fallback?: DownloadPlaybackSessionContext,
  ) {
    const playbackSession = this.getSessionContext(id, fallback);
    if (!playbackSession) return;
    const rawMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";
    const code = /cannot be (?:saved|verified)|hls downloads/i.test(rawMessage)
      ? "SOURCE_UNAVAILABLE"
      : inferPlaybackErrorCodeFromMessages([rawMessage]) ||
        "SOURCE_UNAVAILABLE";
    failPlaybackSession(
      playbackSession.sessionId,
      createPlaybackRuntimeError(code, "Download failed before it was saved.", {
        retryable: true,
        shouldFallback: false,
        debugMessage: rawMessage || undefined,
      }),
    );
  }

  private cancelSession(
    id: string,
    reason: string,
    fallback?: DownloadPlaybackSessionContext,
  ) {
    const playbackSession = this.getSessionContext(id, fallback);
    if (!playbackSession) return;
    cancelPlaybackSession(playbackSession.sessionId, reason);
  }

  private async verifyLocalUri(localUri?: string) {
    if (!localUri) return false;

    if (Platform.OS === "web") {
      return Boolean(
        window.desktopBridge &&
        (await window.desktopBridge.checkFile(localUri).catch(() => false)),
      );
    }

    return FileSystem.getInfoAsync(localUri)
      .then((info) => info.exists)
      .catch(() => false);
  }

  private async finalizeCompletedTask(
    id: string,
    localUri?: string,
    fallback?: DownloadPlaybackSessionContext,
  ) {
    const { tasks, setStatus } = useDownloadStore.getState();
    const task = tasks[id];
    if (
      !task ||
      this.finalizingTasks.has(id) ||
      (task.status === "Completed" && task.localUri === localUri)
    ) {
      return;
    }
    this.finalizingTasks.add(id);
    const playbackSession = task.playbackSession || fallback;

    try {
      this.setSessionStatus(
        playbackSession,
        "verifying_download",
        "Verifying the saved local file.",
      );
      const verified = await this.verifyLocalUri(localUri);
      if (!verified) {
        const message = "Downloaded file could not be verified on this device.";
        setStatus(id, "Error", undefined, message);
        this.failSession(id, message, playbackSession);
        return;
      }

      setStatus(id, "Completed", localUri);
      if (playbackSession) {
        const session =
          usePlaybackSessionStore.getState().sessions[
            playbackSession.sessionId
          ];
        if (
          session &&
          session.status !== "completed" &&
          session.status !== "failed" &&
          session.status !== "cancelled"
        ) {
          usePlaybackSessionStore
            .getState()
            .recordDownloadVerified(playbackSession.sessionId);
          completePlaybackSession(playbackSession.sessionId);
        }
      }
      delete this.lastSessionProgressBucket[id];
      this.notifyDownloadComplete(task.mediaInfo.title);
    } finally {
      this.finalizingTasks.delete(id);
    }
  }

  private ensureDesktopDownloadSubscription() {
    if (Platform.OS !== "web" || this.desktopProgressUnsubscribe) return;

    const desktopBridge = window.desktopBridge;
    if (!desktopBridge) return;

    this.desktopProgressUnsubscribe = desktopBridge.onDownloadProgress(
      (data) => {
        const { tasks, updateProgress, setStatus } =
          useDownloadStore.getState();
        const task = tasks[data.id];
        if (!task) return;

        const totalBytesExpectedToWrite =
          data.totalBytesExpectedToWrite || task.totalBytesExpectedToWrite || 0;
        const totalBytesWritten =
          data.totalBytesWritten || task.totalBytesWritten || 0;
        const progress =
          totalBytesExpectedToWrite > 0
            ? Math.min(totalBytesWritten / totalBytesExpectedToWrite, 1)
            : task.progress;

        updateProgress(
          data.id,
          data.status === "Completed" ? 1 : progress,
          totalBytesWritten,
          totalBytesExpectedToWrite,
        );
        this.recordSessionProgress(
          data.id,
          data.status === "Completed" ? 1 : progress,
          totalBytesWritten,
          totalBytesExpectedToWrite,
        );

        if (data.status === "Completed") {
          void this.finalizeCompletedTask(data.id, data.localUri);
        } else if (data.status) {
          setStatus(
            data.id,
            mapDesktopDownloadStatus(data.status),
            data.localUri,
            data.error,
          );
          if (data.status === "Downloading") {
            this.setSessionStatus(task.playbackSession, "downloading");
          } else if (data.status === "Error") {
            this.failSession(data.id, data.error || "Desktop download failed.");
          } else if (data.status === "Canceled") {
            this.cancelSession(data.id, "Desktop download was cancelled.");
          }
        }
      },
    );
  }

  private applyDesktopJobSnapshot(job: DesktopDownloadJob | null) {
    if (!job) return;

    const { tasks, updateProgress, setStatus } = useDownloadStore.getState();
    if (!tasks[job.id]) return;

    const progress =
      job.totalBytesExpectedToWrite > 0
        ? Math.min(job.totalBytesWritten / job.totalBytesExpectedToWrite, 1)
        : tasks[job.id].progress;

    updateProgress(
      job.id,
      job.status === "Completed" ? 1 : progress,
      job.totalBytesWritten,
      job.totalBytesExpectedToWrite,
    );
    this.recordSessionProgress(
      job.id,
      job.status === "Completed" ? 1 : progress,
      job.totalBytesWritten,
      job.totalBytesExpectedToWrite,
    );

    if (job.status === "Completed") {
      void this.finalizeCompletedTask(job.id, job.localUri);
      return;
    }

    setStatus(
      job.id,
      mapDesktopDownloadStatus(job.status),
      job.localUri,
      job.error,
    );
    if (job.status === "Downloading") {
      this.setSessionStatus(tasks[job.id].playbackSession, "downloading");
    } else if (job.status === "Error") {
      this.failSession(job.id, job.error || "Desktop download failed.");
    } else if (job.status === "Canceled") {
      this.cancelSession(job.id, "Desktop download was cancelled.");
    }
  }

  private notifyDownloadComplete(title: string) {
    api
      .post("/api/notifications", {
        title: "Download Complete",
        message: `"${title}" is ready to watch offline!`,
      })
      .catch((err) => console.warn("Failed to ping completion", err));
  }

  async startDownload(
    stream: Stream,
    mediaInfo: MediaInfo,
    options: DownloadStartOptions = {},
  ) {
    const { addTask, updateProgress, setStatus, setDownloadUrl, removeTask } =
      useDownloadStore.getState();

    const id =
      (mediaInfo as DownloadMediaItem).sourceId ||
      stream.infoHash ||
      stream.url ||
      mediaInfo.itemId;

    const existingTask = useDownloadStore.getState().tasks[id];
    if (
      existingTask?.status === "Pending" ||
      existingTask?.status === "Preparing" ||
      existingTask?.status === "Downloading" ||
      existingTask?.status === "Completed"
    ) {
      if (options.playbackSession) {
        cancelPlaybackSession(
          options.playbackSession.sessionId,
          "Download is already present in the queue.",
        );
      }
      return;
    }

    let eligibility = options.eligibility || getDownloadEligibility(stream);
    if (
      !options.eligibility &&
      stream.infoHash &&
      eligibility.mode === "bridge-torrent" &&
      !eligibility.canDownload
    ) {
      await streamEngineManager.detectBridge();
      eligibility = getDownloadEligibility(stream);
    }

    if (!eligibility.canDownload) {
      this.failSession(
        id,
        eligibility.reason ||
          "This source cannot be saved for offline playback yet.",
        options.playbackSession,
      );
      if (Platform.OS !== "web") {
        Alert.alert(
          "Download unavailable",
          eligibility.reason ||
            "This source cannot be saved for offline playback yet.",
        );
      } else if (__DEV__) {
        console.warn("[DownloadService]", eligibility.reason);
      }
      return;
    }

    if (eligibility.mode === "browser-external" && stream.externalUrl) {
      this.failSession(
        id,
        eligibility.reason ||
          "External browser downloads cannot be verified offline.",
        options.playbackSession,
      );
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = stream.externalUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      return;
    }

    const initialDownloadUrl =
      options.resolvedUrl || stream.url || stream.externalUrl || "";
    addTask(
      id,
      {
        ...mediaInfo,
        downloadUrl: initialDownloadUrl,
        sourceId: id,
      },
      options.playbackSession,
    );
    setStatus(id, "Preparing");

    // 1. Resolve playback URI after eligibility is known.
    let downloadUrl: string | undefined;
    try {
      downloadUrl =
        options.resolvedUrl ||
        (await streamEngineManager.getPlaybackUri(stream)) ||
        undefined;
    } catch (e: any) {
      setStatus(
        id,
        "Error",
        undefined,
        `Resolution failed: ${e?.message || String(e)}`,
      );
      this.failSession(id, e, options.playbackSession);
      return;
    }

    if (!downloadUrl) {
      setStatus(id, "Error", undefined, "Could not resolve playback URL");
      this.failSession(
        id,
        "Could not resolve playback URL",
        options.playbackSession,
      );
      if (__DEV__)
        console.error(
          "[DownloadService] Could not resolve playback URI for download",
        );
      return;
    }

    if (downloadUrl.includes(".m3u8")) {
      setStatus(id, "Error", undefined, "HLS downloads are not supported");
      this.failSession(
        id,
        "HLS downloads are not supported",
        options.playbackSession,
      );
      Alert.alert(
        "Unsupported Format",
        "HLS (.m3u8) streams cannot be downloaded natively for offline use. Please select a different playback source.",
      );
      return;
    }

    setDownloadUrl(id, downloadUrl);
    const filename = `${id.replace(/[^a-z0-9]/gi, "_")}.mp4`;

    // WEB/DESKTOP IMPLEMENTATION
    if (Platform.OS === "web") {
      const desktopBridge = window.desktopBridge;

      if (desktopBridge) {
        setStatus(id, "Downloading");
        this.setSessionStatus(options.playbackSession, "downloading");
        this.recordSessionProgress(id, 0, 0, 0);
        this.ensureDesktopDownloadSubscription();

        if (desktopBridge.startDownloadJob) {
          try {
            const job = await desktopBridge.startDownloadJob(
              id,
              downloadUrl,
              filename,
            );
            this.applyDesktopJobSnapshot(job);
          } catch (e: any) {
            setStatus(id, "Error", undefined, e.message);
            this.failSession(id, e, options.playbackSession);
          }
          return;
        }

        const unsubscribe = desktopBridge.onDownloadProgress((data) => {
          if (data.id === id) {
            const progress =
              data.totalBytesExpectedToWrite > 0
                ? data.totalBytesWritten / data.totalBytesExpectedToWrite
                : 0;
            updateProgress(
              id,
              progress,
              data.totalBytesWritten,
              data.totalBytesExpectedToWrite,
            );
            this.recordSessionProgress(
              id,
              progress,
              data.totalBytesWritten,
              data.totalBytesExpectedToWrite,
            );
          }
        });

        try {
          const localUri = await desktopBridge.downloadMedia(
            id,
            downloadUrl,
            filename,
          );
          unsubscribe();
          await this.finalizeCompletedTask(
            id,
            localUri,
            options.playbackSession,
          );
          if (__DEV__)
            console.log(
              "[DownloadService] Desktop download completed:",
              localUri,
            );
        } catch (e: any) {
          unsubscribe();
          setStatus(id, "Error", undefined, e.message);
          this.failSession(id, e, options.playbackSession);
        }
        return;
      }

      // Native Browser Fallback
      try {
        const link = document.createElement("a");
        link.href = stream.externalUrl || downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (__DEV__) {
          console.info(
            "[DownloadService] Browser download opened externally; not marking offline-complete",
          );
        }
        this.failSession(
          id,
          "Browser download opened externally and cannot be verified offline.",
          options.playbackSession,
        );
        removeTask(id);
      } catch (e: any) {
        setStatus(id, "Error", undefined, e.message);
        this.failSession(id, e, options.playbackSession);
      }
      return;
    }

    // LOCAL NATIVE IMPLEMENTATION
    // We'll use a specific directory for downloads
    const downloadDir = `${FileSystem.documentDirectory}downloads/`;
    const dirInfo = await FileSystem.getInfoAsync(downloadDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
    }

    const localUri = `${downloadDir}${filename}`;
    const { setResumeData } = useDownloadStore.getState();

    // Now move from Preparing to Downloading
    setStatus(id, "Downloading", localUri);
    this.setSessionStatus(options.playbackSession, "downloading");
    this.recordSessionProgress(id, 0, 0, 0);

    // 3. Setup callback with periodic state saving
    let lastSavedProgress = 0;
    const callback = async (
      downloadProgress: FileSystem.DownloadProgressData,
    ) => {
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;

      updateProgress(
        id,
        progress,
        downloadProgress.totalBytesWritten,
        downloadProgress.totalBytesExpectedToWrite,
      );
      this.recordSessionProgress(
        id,
        progress,
        downloadProgress.totalBytesWritten,
        downloadProgress.totalBytesExpectedToWrite,
      );

      // Periodically save resumable state to persistent storage (every 5%)
      if (progress - lastSavedProgress > 0.05) {
        try {
          const resumable = this.downloadResumables[id];
          if (resumable) {
            const savable = await resumable.savable();
            setResumeData(id, JSON.stringify(savable));
            lastSavedProgress = progress;
          }
        } catch (e) {
          console.warn("[DownloadService] Failed to save resumable state", e);
        }
      }
    };

    // 4. Create and start resumable download
    const downloadResumable = FileSystem.createDownloadResumable(
      downloadUrl,
      localUri,
      {},
      callback,
    );

    this.downloadResumables[id] = downloadResumable;

    try {
      const result = await downloadResumable.downloadAsync();
      if (result) {
        await this.finalizeCompletedTask(
          id,
          result.uri,
          options.playbackSession,
        );
        // Clear resume data on completion
        setResumeData(id, "");
        if (__DEV__)
          console.log("[DownloadService] Download completed:", result.uri);
      }
    } catch (e: any) {
      if (__DEV__) console.error("[DownloadService] Download failed:", e);
      // If it was cancelled manually, we don't mark as error here usually
      if (useDownloadStore.getState().tasks[id]?.status !== "Paused") {
        setStatus(id, "Error", undefined, e.message);
        this.failSession(id, e, options.playbackSession);
      }
    } finally {
      delete this.downloadResumables[id];
    }
  }

  /**
   * Initializes the download service by scanning for interrupted tasks
   * and preparing them for resumption.
   */
  async initialize() {
    const { tasks, setStatus } = useDownloadStore.getState();
    const completedTasks = Object.values(tasks).filter(
      (task) => task.status === "Completed",
    );
    const interruptedTasks = Object.values(tasks).filter(
      (t) =>
        t.status === "Downloading" ||
        t.status === "Paused" ||
        t.status === "Preparing",
    );

    for (const task of completedTasks) {
      if (!(await this.verifyLocalUri(task.localUri))) {
        setStatus(
          task.id,
          "Error",
          undefined,
          "Downloaded file could not be verified on this device.",
        );
      }
    }

    if (Platform.OS === "web") {
      this.ensureDesktopDownloadSubscription();
      const desktopBridge = window.desktopBridge;

      for (const task of interruptedTasks) {
        if (desktopBridge?.getDownloadJob) {
          try {
            const job = await desktopBridge.getDownloadJob(task.id);
            if (job) {
              this.applyDesktopJobSnapshot(job);
              continue;
            }
          } catch (e) {
            console.warn(`[DownloadService] Failed to check job ${task.id}`, e);
          }
        }

        // If we can't find a running job on bridge, mark as Paused/Error
        if (task.status === "Downloading" || task.status === "Preparing") {
          setStatus(task.id, "Paused");
        }
      }

      return;
    }

    for (const task of interruptedTasks) {
      // If it was "Downloading" or "Preparing" but we just started, it's effectively "Paused"
      if (task.status === "Downloading" || task.status === "Preparing") {
        setStatus(task.id, "Paused");
      }

      // Verification of local file existence
      if (task.localUri) {
        try {
          const info = await FileSystem.getInfoAsync(task.localUri);
          if (!info.exists && task.progress > 0) {
            console.warn(
              `[DownloadService] Local file missing for task ${task.id}, marking as error`,
            );
            setStatus(task.id, "Error", undefined, "Local file vanished");
          }
        } catch (e) {
          // Non-critical background verify failure
        }
      }
    }

    if (__DEV__)
      console.log(
        `[DownloadService] Initialized with ${interruptedTasks.length} stateful tasks`,
      );
  }

  async pauseDownload(id: string) {
    if (Platform.OS === "web") {
      const desktopBridge = window.desktopBridge;
      if (desktopBridge?.pauseDownloadJob) {
        this.applyDesktopJobSnapshot(await desktopBridge.pauseDownloadJob(id));
      }
      return;
    }

    const resumable = this.downloadResumables[id];
    if (resumable) {
      try {
        const pauseResult = await resumable.pauseAsync();
        const resumeData = JSON.stringify(await resumable.savable());
        useDownloadStore
          .getState()
          .setStatus(id, "Paused", undefined, undefined, resumeData);
        console.log("[DownloadService] Download paused and state saved");
      } catch (e) {
        if (__DEV__) console.error("[DownloadService] Pause failed:", e);
      }
    }
  }

  async resumeDownload(id: string) {
    if (Platform.OS === "web") {
      const desktopBridge = window.desktopBridge;
      if (desktopBridge?.resumeDownloadJob) {
        this.ensureDesktopDownloadSubscription();
        this.applyDesktopJobSnapshot(await desktopBridge.resumeDownloadJob(id));
        return;
      }
    }

    const { tasks, setStatus, updateProgress, setResumeData } =
      useDownloadStore.getState();
    const task = tasks[id];
    if (task && (task.status === "Paused" || task.status === "Error")) {
      let resumable = this.downloadResumables[id];

      if (!resumable && task.resumeData && task.localUri) {
        const callback = async (
          downloadProgress: FileSystem.DownloadProgressData,
        ) => {
          const progress =
            downloadProgress.totalBytesWritten /
            downloadProgress.totalBytesExpectedToWrite;
          updateProgress(
            id,
            progress,
            downloadProgress.totalBytesWritten,
            downloadProgress.totalBytesExpectedToWrite,
          );
          this.recordSessionProgress(
            id,
            progress,
            downloadProgress.totalBytesWritten,
            downloadProgress.totalBytesExpectedToWrite,
          );

          // Periodically save resumable state to persistent storage (every 5%)
          if (
            Math.floor(progress * 20) > Math.floor((task.progress || 0) * 20)
          ) {
            try {
              const r = this.downloadResumables[id];
              if (r) {
                const savable = await r.savable();
                setResumeData(id, JSON.stringify(savable));
              }
            } catch (e) {}
          }
        };

        try {
          const savable = JSON.parse(task.resumeData);
          resumable = new FileSystem.DownloadResumable(
            savable.url,
            savable.fileUri,
            savable.options,
            callback,
            savable.resumeData,
          );
          this.downloadResumables[id] = resumable;
        } catch (e) {
          console.warn("[DownloadService] Failed to rehydrate resumable", e);
        }
      }

      if (resumable) {
        setStatus(id, "Downloading");
        this.setSessionStatus(task.playbackSession, "downloading");
        try {
          const result = await resumable.resumeAsync();
          if (result) {
            await this.finalizeCompletedTask(id, result.uri);
            setResumeData(id, "");
            console.log("[DownloadService] Download completed:", result.uri);
          }
        } catch (e: any) {
          console.error("[DownloadService] Resume failed:", e);
          if (tasks[id]?.status !== "Paused") {
            setStatus(id, "Error", undefined, e.message);
            this.failSession(id, e);
          }
        } finally {
          delete this.downloadResumables[id];
        }
      } else {
        if (__DEV__)
          console.warn(
            "[DownloadService] Resumable object and resumeData lost, restarting download",
          );
        if (task.mediaInfo.downloadUrl) {
          this.startDownload(
            { url: task.mediaInfo.downloadUrl },
            task.mediaInfo,
            {
              resolvedUrl: task.mediaInfo.downloadUrl,
              playbackSession: task.playbackSession,
            },
          );
        } else {
          setStatus(id, "Error", undefined, "Original download URL missing");
          this.failSession(id, "Original download URL missing");
        }
      }
    }
  }

  async deleteDownload(id: string) {
    const { tasks, removeTask } = useDownloadStore.getState();
    const task = tasks[id];
    this.cancelSession(id, "Download was removed.");

    if (Platform.OS === "web") {
      const desktopBridge = window.desktopBridge;
      if (desktopBridge?.cancelDownloadJob) {
        await desktopBridge.cancelDownloadJob(id).catch(() => null);
      }

      if (desktopBridge && task?.localUri) {
        try {
          await desktopBridge.deleteFile(task.localUri);
          removeTask(id);
          if (__DEV__)
            console.log(
              "[DownloadService] Deleted desktop local file and task",
            );
        } catch (e) {
          if (__DEV__)
            console.error("[DownloadService] Desktop deletion failed:", e);
        }
        return;
      }

      // Vanilla Browser Fallback
      // Browser files are stored externally by the user; we only clear our state
      removeTask(id);
      return;
    }

    if (task && task.localUri) {
      try {
        await FileSystem.deleteAsync(task.localUri, { idempotent: true });
        removeTask(id);
        if (__DEV__)
          console.log("[DownloadService] Deleted local file and task");
      } catch (e) {
        if (__DEV__) console.error("[DownloadService] Deletion failed:", e);
      }
    } else {
      removeTask(id);
    }
  }
}

export const downloadService = new DownloadService();
