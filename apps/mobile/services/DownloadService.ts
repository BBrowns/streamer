import * as FileSystem from "expo-file-system/legacy";
import { Platform, Alert } from "react-native";
import { useDownloadStore, DownloadMediaItem } from "../stores/downloadStore";
import { MediaInfo } from "../stores/playerStore";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import type { Stream } from "@streamer/shared";

class DownloadService {
  private downloadResumables: Record<string, FileSystem.DownloadResumable> = {};

  async startDownload(stream: Stream, mediaInfo: MediaInfo) {
    const { addTask, updateProgress, setStatus, tasks } =
      useDownloadStore.getState();

    // 1. Resolve playback URI
    const downloadUrl = await streamEngineManager.getPlaybackUri(stream);
    if (!downloadUrl) {
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

    // WEB IMPLEMENTATION: Trigger browser native download popup
    if (Platform.OS === "web") {
      try {
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // We can't track perfect granular progress natively via link clicks, just mark it completed
        addTask(id, { ...mediaInfo, downloadUrl });
        setStatus(id, "Completed", downloadUrl);
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
    setStatus(id, "Downloading", localUri);

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
        console.log("[DownloadService] Download completed:", result.uri);
      }
    } catch (e: any) {
      console.error("[DownloadService] Download failed:", e);
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
        const resumeData = pauseResult?.resumeData;
        useDownloadStore
          .getState()
          .setStatus(id, "Paused", undefined, undefined, resumeData);
        console.log("[DownloadService] Download paused");
      } catch (e) {
        console.error("[DownloadService] Pause failed:", e);
      }
    }
  }

  async resumeDownload(id: string) {
    const { tasks, setStatus, updateProgress } = useDownloadStore.getState();
    const task = tasks[id];
    if (task && task.status === "Paused") {
      let resumable = this.downloadResumables[id];

      if (!resumable && task.resumeData && task.localUri) {
        const callback = (
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
        };
        resumable = FileSystem.createDownloadResumable(
          task.mediaInfo.downloadUrl,
          task.localUri,
          {},
          callback,
          task.resumeData,
        );
        this.downloadResumables[id] = resumable;
      }

      if (resumable) {
        setStatus(id, "Downloading");
        try {
          const result = await resumable.resumeAsync();
          if (result) {
            setStatus(id, "Completed", result.uri);
            console.log("[DownloadService] Download completed:", result.uri);
          }
        } catch (e: any) {
          console.error("[DownloadService] Resume failed:", e);
          setStatus(id, "Error", undefined, e.message);
        } finally {
          delete this.downloadResumables[id];
        }
      } else {
        console.warn(
          "[DownloadService] Resumable object lost, restarting download",
        );
        this.startDownload(task.mediaInfo as any as Stream, task.mediaInfo);
      }
    }
  }

  async deleteDownload(id: string) {
    const { tasks, removeTask } = useDownloadStore.getState();
    const task = tasks[id];

    if (Platform.OS === "web") {
      // Browser files are stored externally by the user; we only clear our state
      removeTask(id);
      return;
    }

    if (task && task.localUri) {
      try {
        await FileSystem.deleteAsync(task.localUri, { idempotent: true });
        removeTask(id);
        console.log("[DownloadService] Deleted local file and task");
      } catch (e) {
        console.error("[DownloadService] Deletion failed:", e);
      }
    } else {
      removeTask(id);
    }
  }
}

export const downloadService = new DownloadService();
