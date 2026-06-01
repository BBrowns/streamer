export interface DesktopDownloadProgressData {
  id: string;
  status?: DesktopDownloadJobStatus;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  localUri?: string;
  error?: string;
}

export type DesktopDownloadJobStatus =
  | "Pending"
  | "Downloading"
  | "Paused"
  | "Completed"
  | "Error"
  | "Canceled";

export interface DesktopDownloadJob {
  id: string;
  status: DesktopDownloadJobStatus;
  downloadUrl: string;
  filename: string;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  localUri?: string;
  error?: string;
}

export interface DesktopBridgeInfo {
  available: boolean;
  localUrl: string;
  lanUrl: string;
  pairingToken?: string;
}

export interface DesktopBridge {
  /**
   * Starts downloading a remote URL to the local disk.
   * Returns a promise that resolves with the desktop `streamer://` local URI.
   */
  downloadMedia(
    id: string,
    downloadUrl: string,
    filename: string,
  ): Promise<string>;

  /**
   * Starts or returns a managed desktop download job.
   */
  startDownloadJob(
    id: string,
    downloadUrl: string,
    filename: string,
  ): Promise<DesktopDownloadJob>;

  getDownloadJob(id: string): Promise<DesktopDownloadJob | null>;
  pauseDownloadJob(id: string): Promise<DesktopDownloadJob | null>;
  resumeDownloadJob(id: string): Promise<DesktopDownloadJob | null>;
  cancelDownloadJob(id: string): Promise<DesktopDownloadJob | null>;

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
