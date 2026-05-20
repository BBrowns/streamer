// global.d.ts

interface DesktopDownloadProgressData {
  id: string;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

interface DesktopBridge {
  /**
   * Starts downloading a remote URL to the local disk.
   * Returns a promise that resolves with the absolute `file://` local URI.
   */
  downloadMedia(
    id: string,
    downloadUrl: string,
    filename: string,
  ): Promise<string>;

  /**
   * Subscribes to download progress events.
   * Returns an unsubscribe function.
   */
  onDownloadProgress(
    callback: (data: DesktopDownloadProgressData) => void,
  ): () => void;

  /**
   * Deletes a downloaded file from the user's local disk.
   */
  deleteFile(localUri: string): Promise<void>;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};
