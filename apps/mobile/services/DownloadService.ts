import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
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
      const desktopBridge = (window as any).desktopBridge;

      if (desktopBridge) {
        addTask(id, { ...mediaInfo, downloadUrl });
        setStatus(id, "Downloading");

        const unsubscribe = desktopBridge.onDownloadProgress((data: any) => {
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

    addTask(id, { ...mediaInfo, downloadUrl });
    setStatus(id, "Downloading");

    // 3. Setup callback
    const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;
      updateProgress(
        id,
        progress,
        downloadProgress.totalBytesWritten,
        downloadProgress.totalBytesExpectedToWrite,
      );
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
      setStatus(id, "Error", undefined, e.message);
    } finally {
      delete this.downloadResumables[id];
    }
  }

  async pauseDownload(id: string) {
    const resumable = this.downloadResumables[id];
    if (resumable) {
      try {
        const pauseResult = await resumable.pauseAsync();
        if (pauseResult.resumeData) {
          useDownloadStore.getState().setResumeData(id, pauseResult.resumeData);
        }
        useDownloadStore.getState().setStatus(id, "Paused");
        if (__DEV__) console.log("[DownloadService] Download paused");
      } catch (e) {
        if (__DEV__) console.error("[DownloadService] Pause failed:", e);
      }
    }
  }

  async resumeDownload(id: string) {
    const { tasks, setStatus, updateProgress } = useDownloadStore.getState();
    const task = tasks[id];
    if (task && task.status === "Paused") {
      const resumable = this.downloadResumables[id];
      if (resumable) {
        setStatus(id, "Downloading");
        await resumable.resumeAsync();
      } else if (task.resumeData && task.localUri) {
        // Construct a new callback (same as in startDownload)
        const callback = (
          downloadProgress: FileSystem.DownloadProgressData,
        ) => {
          const progress =
            downloadProgress.totalBytesExpectedToWrite > 0
              ? downloadProgress.totalBytesWritten /
                downloadProgress.totalBytesExpectedToWrite
              : 0;
          updateProgress(
            id,
            progress,
            downloadProgress.totalBytesWritten,
            downloadProgress.totalBytesExpectedToWrite,
          );
        };
        // Re-initialize resumable with stored data
        const newResumable = FileSystem.createDownloadResumable(
          task.mediaInfo.downloadUrl,
          task.localUri,
          {},
          callback,
          task.resumeData,
        );
        this.downloadResumables[id] = newResumable;
        setStatus(id, "Downloading");
        try {
          const result = await newResumable.resumeAsync();
          if (result) {
            setStatus(id, "Completed", result.uri);
          }
        } catch (e: any) {
          if (__DEV__) console.error("[DownloadService] Resume failed:", e);
          setStatus(id, "Error", undefined, e.message);
        }
      } else {
        if (__DEV__)
          console.warn(
            "[DownloadService] Resumable object and resumeData lost, restarting download",
          );
        this.startDownload(task.mediaInfo as any as Stream, task.mediaInfo);
      }
    }
  }

  async deleteDownload(id: string) {
    const { tasks, removeTask } = useDownloadStore.getState();
    const task = tasks[id];

    if (Platform.OS === "web") {
      const desktopBridge = (window as any).desktopBridge;
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
