import * as FileSystem from "expo-file-system/legacy";
import { Platform, Alert } from "react-native";
import { useDownloadStore, DownloadMediaItem } from "../stores/downloadStore";
import { MediaInfo } from "../stores/playerStore";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import type { Stream } from "@streamer/shared";
import { api } from "./api";

class DownloadService {
  private downloadResumables: Record<string, FileSystem.DownloadResumable> = {};

  async startDownload(stream: Stream, mediaInfo: MediaInfo) {
    const { addTask, updateProgress, setStatus, tasks } =
      useDownloadStore.getState();

    // 1. Resolve playback URI
    const downloadUrl = await streamEngineManager.getPlaybackUri(stream);
    if (!downloadUrl) {
      if (__DEV__)
        console.error(
          "[DownloadService] Could not resolve playback URI for download",
        );
      return;
    }

    if (downloadUrl.includes(".m3u8") && Platform.OS !== "web") {
      Alert.alert(
        "Unsupported Format",
        "HLS (.m3u8) streams cannot be downloaded natively for offline use. Please select a different playback source.",
      );
      return;
    }

    const id = stream.infoHash || stream.url || mediaInfo.itemId;

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
        addTask(id, { ...mediaInfo, downloadUrl });
        setStatus(id, "Downloading");

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
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // We can't track perfect granular progress natively via link clicks, just mark it completed
        addTask(id, { ...mediaInfo, downloadUrl });
        // Setting localUri to undefined since Web doesn't store a local file accessible to Expo FileSystem
        setStatus(id, "Completed", undefined);
      } catch (e: any) {
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

    addTask(id, { ...mediaInfo, downloadUrl });
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
        // Cast to any to bypass strict type check for now if mediaInfo has minor mismatch
        this.startDownload(task.mediaInfo as any, task.mediaInfo);
      }
    }
  }

  async deleteDownload(id: string) {
    const { tasks, removeTask } = useDownloadStore.getState();
    const task = tasks[id];

    if (Platform.OS === "web") {
      const desktopBridge = window.desktopBridge;
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
