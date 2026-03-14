import * as FileSystem from "expo-file-system/legacy";
import { Platform, Alert } from "react-native";
import { useDownloadStore, DownloadMediaItem } from "../stores/downloadStore";
import { MediaInfo } from "../stores/playerStore";
import { streamEngineManager } from "./streamEngine/StreamEngineManager";
import type { Stream } from "@streamer/shared";

class DownloadService {
  private downloadResumables: Record<string, FileSystem.DownloadResumable> = {};
  private pollInterval: any = null;
  private isInitialized: boolean = false;

  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (Platform.OS === "web") {
      const { tasks } = useDownloadStore.getState();
      const hasActiveTasks = Object.values(tasks).some(
        (t) => t.status === "Downloading",
      );

      if (hasActiveTasks) {
        console.log("[DownloadService] Resuming bridge polling on startup");
        this.startPolling();
      }
    }
  }

  async startDownload(stream: Stream, mediaInfo: MediaInfo) {
    const { addTask, updateProgress, setStatus, tasks } =
      useDownloadStore.getState();

    if (Platform.OS === "web") {
      // If bridge is available (Electron/Desktop), use persistent download
      if (
        streamEngineManager.bridgeAvailable &&
        streamEngineManager.activeStrategy === "local"
      ) {
        const id = stream.infoHash || stream.url || mediaInfo.itemId;
        if (
          tasks[id]?.status === "Downloading" ||
          tasks[id]?.status === "Completed"
        )
          return;

        addTask(id, { ...mediaInfo, downloadUrl: "" });
        setStatus(id, "Downloading");

        try {
          let magnet = `magnet:?xt=urn:btih:${stream.infoHash}`;
          // Append trackers... (simplified for brevity, mirroring TorrentEngine)
          const trackers = ["udp://tracker.opentrackr.org:1337/announce"];
          for (const tr of trackers) magnet += `&tr=${encodeURIComponent(tr)}`;

          const res = await fetch(
            `${streamEngineManager.bridgeUrl}/api/download`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ magnet, itemId: mediaInfo.itemId }),
            },
          );

          if (!res.ok) throw new Error("Bridge download failed");
          console.log("[DownloadService] Bridge download started");

          // Start polling for progress
          this.startPolling();
        } catch (e: any) {
          console.error("[DownloadService] Bridge download error:", e);
          setStatus(id, "Error", undefined, e.message);
        }
        return;
      }

      // Browser fallback (native <a> trigger)
      const downloadUrl = await streamEngineManager.getPlaybackUri(stream);
      if (!downloadUrl) {
        Alert.alert("Error", "Could not resolve download URL");
        return;
      }

      const id = stream.infoHash || stream.url || mediaInfo.itemId;
      const filename = `${id.replace(/[^a-z0-9]/gi, "_")}.mp4`;

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

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

  async syncDesktopDownloads() {
    if (Platform.OS !== "web" || !streamEngineManager.bridgeAvailable) return;

    const { setStatus, tasks, updateProgress } = useDownloadStore.getState();

    try {
      const res = await fetch(`${streamEngineManager.bridgeUrl}/api/downloads`);
      if (!res.ok) return;

      const { downloads } = await res.json();
      let activeDownloads = 0;

      for (const dl of downloads) {
        const id = dl.infoHash;
        if (tasks[id]) {
          const newStatus =
            dl.status === "Completed" ? "Completed" : "Downloading";
          const progress = dl.progress || 0;

          if (newStatus === "Downloading") activeDownloads++;

          const localUri =
            newStatus === "Completed"
              ? `${streamEngineManager.bridgeUrl}/stream?magnet=magnet:?xt=urn:btih:${id}`
              : undefined;

          // Always update progress if it changed
          if (tasks[id].progress !== progress) {
            updateProgress(id, progress, 0, 0); // sizes aren't strictly needed for UI bar but could be added
          }

          if (tasks[id].status !== newStatus) {
            setStatus(id, newStatus, localUri);
          }
        }
      }

      // If no active downloads, stop polling
      if (activeDownloads === 0 && this.pollInterval) {
        this.stopPolling();
      } else if (activeDownloads > 0 && !this.pollInterval) {
        this.startPolling();
      }
    } catch (e) {
      console.warn("[DownloadService] Failed to sync desktop downloads:", e);
    }
  }

  private startPolling() {
    if (this.pollInterval) return;
    console.log("[DownloadService] Starting bridge polling");
    this.pollInterval = setInterval(() => {
      this.syncDesktopDownloads();
    }, 3000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      console.log("[DownloadService] Stopping bridge polling");
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

export const downloadService = new DownloadService();
