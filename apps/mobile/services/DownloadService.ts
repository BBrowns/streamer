import * as FileSystem from "expo-file-system/legacy";
import { useDownloadStore, DownloadMediaItem } from "../stores/downloadStore";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import type { Stream } from "@streamer/shared";

class DownloadService {
  private downloadResumables: Record<string, FileSystem.DownloadResumable> = {};

  async startDownload(stream: Stream, mediaInfo: DownloadMediaItem) {
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

    const id = stream.infoHash || stream.url || mediaInfo.itemId;

    // Check if already downloading or completed
    if (
      tasks[id]?.status === "Downloading" ||
      tasks[id]?.status === "Completed"
    ) {
      return;
    }

    // 2. Prepare local path
    // We'll use a specific directory for downloads
    const downloadDir = `${FileSystem.documentDirectory}downloads/`;
    const dirInfo = await FileSystem.getInfoAsync(downloadDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
    }

    const filename = `${id.replace(/[^a-z0-9]/gi, "_")}.mp4`;
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
        // Save the pause result (resume data) if we want bit-perfect resumption later
        // For now we just set status to Paused
        useDownloadStore.getState().setStatus(id, "Paused");
        console.log("[DownloadService] Download paused");
      } catch (e) {
        console.error("[DownloadService] Pause failed:", e);
      }
    }
  }

  async resumeDownload(id: string) {
    const { tasks, setStatus } = useDownloadStore.getState();
    const task = tasks[id];
    if (task && task.status === "Paused") {
      // Re-initialize resumable if needed or use existing
      // Note: Full resumption requires storing the 'pauseResult.json()' string
      // For this MVP, we'll just restart if the resumable object is gone,
      // but ideally we'd store the resume data in the store.
      const resumable = this.downloadResumables[id];
      if (resumable) {
        setStatus(id, "Downloading");
        await resumable.resumeAsync();
      } else {
        // If the object is gone (e.g. app restart), we restart for now.
        // In a real app we'd load the resume data from storage.
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
