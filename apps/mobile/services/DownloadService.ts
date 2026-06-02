import * as FileSystem from "expo-file-system/legacy";
import { Platform, Alert } from "react-native";
import {
  useDownloadStore,
  type DownloadMediaItem,
  type DownloadStatus,
} from "../stores/downloadStore";
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

export {
  getDownloadEligibility,
  type DownloadEligibility,
  type DownloadEligibilityMode,
} from "./downloadEligibility";

export interface DownloadStartOptions {
  resolvedUrl?: string;
  eligibility?: DownloadEligibility;
}

export function mapDesktopDownloadStatus(
  status?: DesktopDownloadJobStatus,
): DownloadStatus {
  switch (status) {
    case "Completed":
      return "Completed";
    case "Paused":
      return "Paused";
    case "Error":
    case "Canceled":
      return "Error";
    case "Pending":
    case "Downloading":
    default:
      return "Downloading";
  }
}

class DownloadService {
  private downloadResumables: Record<string, FileSystem.DownloadResumable> = {};
  private desktopProgressUnsubscribe: (() => void) | null = null;

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

        if (data.status) {
          setStatus(
            data.id,
            mapDesktopDownloadStatus(data.status),
            data.localUri,
            data.error,
          );
        }

        if (data.status === "Completed" && task.status !== "Completed") {
          this.notifyDownloadComplete(task.mediaInfo.title);
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
    setStatus(
      job.id,
      mapDesktopDownloadStatus(job.status),
      job.localUri,
      job.error,
    );

    if (job.status === "Completed" && tasks[job.id].status !== "Completed") {
      this.notifyDownloadComplete(tasks[job.id].mediaInfo.title);
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
    const { addTask, updateProgress, setStatus, tasks } =
      useDownloadStore.getState();

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

    // 1. Resolve playback URI after eligibility is known.
    const downloadUrl =
      options.resolvedUrl || (await streamEngineManager.getPlaybackUri(stream));
    if (!downloadUrl) {
      if (__DEV__)
        console.error(
          "[DownloadService] Could not resolve playback URI for download",
        );
      return;
    }

    if (downloadUrl.includes(".m3u8")) {
      Alert.alert(
        "Unsupported Format",
        "HLS (.m3u8) streams cannot be downloaded natively for offline use. Please select a different playback source.",
      );
      return;
    }

    const id =
      (mediaInfo as DownloadMediaItem).sourceId ||
      stream.infoHash ||
      stream.url ||
      mediaInfo.itemId;

    // Check if already downloading or completed
    if (
      tasks[id]?.status === "Downloading" ||
      tasks[id]?.status === "Completed"
    ) {
      return;
    }

    const filename = `${id.replace(/[^a-z0-9]/gi, "_")}.mp4`;

    // WEB/DESKTOP IMPLEMENTATION
    if (Platform.OS === "web") {
      const desktopBridge = window.desktopBridge;

      if (desktopBridge) {
        addTask(id, { ...mediaInfo, downloadUrl, sourceId: id });
        setStatus(id, "Downloading");
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
          }
        });

        try {
          const localUri = await desktopBridge.downloadMedia(
            id,
            downloadUrl,
            filename,
          );
          unsubscribe();
          setStatus(id, "Completed", localUri);
          if (__DEV__)
            console.log(
              "[DownloadService] Desktop download completed:",
              localUri,
            );

          api
            .post("/api/notifications", {
              title: "Download Complete",
              message: `"${mediaInfo.title}" is ready to watch offline!`,
            })
            .catch((err) => console.warn("Failed to ping completion", err));
        } catch (e: any) {
          unsubscribe();
          setStatus(id, "Error", undefined, e.message);
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
      } catch (e: any) {
        addTask(id, { ...mediaInfo, downloadUrl, sourceId: id });
        setStatus(id, "Error", undefined, e.message);
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

    addTask(id, { ...mediaInfo, downloadUrl, sourceId: id });
    setStatus(id, "Downloading", localUri);

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
        setStatus(id, "Completed", result.uri);
        // Clear resume data on completion
        setResumeData(id, "");
        if (__DEV__)
          console.log("[DownloadService] Download completed:", result.uri);

        // Notify backend of completion
        api
          .post("/api/notifications", {
            title: "Download Complete",
            message: `"${mediaInfo.title}" is ready to watch offline!`,
          })
          .catch((err) =>
            console.warn(
              "[DownloadService] Failed to notify backend of download completion",
              err,
            ),
          );
      }
    } catch (e: any) {
      if (__DEV__) console.error("[DownloadService] Download failed:", e);
      // If it was cancelled manually, we don't mark as error here usually
      if (tasks[id]?.status !== "Paused") {
        setStatus(id, "Error", undefined, e.message);
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
    const interruptedTasks = Object.values(tasks).filter(
      (t) => t.status === "Downloading" || t.status === "Paused",
    );

    if (Platform.OS === "web") {
      this.ensureDesktopDownloadSubscription();
      const desktopBridge = window.desktopBridge;

      for (const task of interruptedTasks) {
        if (desktopBridge?.getDownloadJob) {
          const job = await desktopBridge.getDownloadJob(task.id);
          if (job) {
            this.applyDesktopJobSnapshot(job);
            continue;
          }
        }

        if (task.status === "Downloading") {
          setStatus(task.id, "Paused");
        }
      }

      return;
    }

    for (const task of interruptedTasks) {
      // If it was "Downloading" but we just started, it's effectively "Paused"
      if (task.status === "Downloading") {
        setStatus(task.id, "Paused");
      }

      // Verification of local file existence
      if (task.localUri) {
        const info = await FileSystem.getInfoAsync(task.localUri);
        if (!info.exists && task.progress > 0) {
          console.warn(
            `[DownloadService] Local file missing for task ${task.id}, marking as error`,
          );
          setStatus(task.id, "Error", undefined, "Local file missing");
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
        try {
          const result = await resumable.resumeAsync();
          if (result) {
            setStatus(id, "Completed", result.uri);
            setResumeData(id, "");
            console.log("[DownloadService] Download completed:", result.uri);
          }
        } catch (e: any) {
          console.error("[DownloadService] Resume failed:", e);
          if (tasks[id]?.status !== "Paused") {
            setStatus(id, "Error", undefined, e.message);
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
          );
        } else {
          setStatus(id, "Error", undefined, "Original download URL missing");
        }
      }
    }
  }

  async deleteDownload(id: string) {
    const { tasks, removeTask } = useDownloadStore.getState();
    const task = tasks[id];

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
