export interface DesktopDownloadProgressData {
  id: string;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

export interface DesktopBridgeInfo {
  available: boolean;
  localUrl: string;
  lanUrl: string;
}

export interface DesktopBridge {
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
   * Checks whether a downloaded desktop URI still exists.
   */
  checkFile(localUri: string): Promise<boolean>;

  /**
   * Deletes a downloaded file from the user's local disk.
   */
  deleteFile(localUri: string): Promise<void>;

  /**
   * Returns the local and LAN bridge URLs exposed by the desktop shell.
   */
  getBridgeInfo(): Promise<DesktopBridgeInfo>;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
