// global.d.ts

interface DesktopDownloadProgressData {
  id: string;
  status?:
    | "Pending"
    | "Downloading"
    | "Paused"
    | "Completed"
    | "Error"
    | "Canceled";
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  localUri?: string;
  error?: string;
}

interface DesktopDownloadJob {
  id: string;
  status:
    | "Pending"
    | "Downloading"
    | "Paused"
    | "Completed"
    | "Error"
    | "Canceled";
  downloadUrl: string;
  filename: string;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  localUri?: string;
  error?: string;
}

interface DesktopBridgeInfo {
  available: boolean;
  localUrl: string;
  lanUrl: string;
  pairingToken?: string;
  diagnostics?: {
    status?: "starting" | "running" | "stopped" | "error";
    startedAt?: number | null;
    updatedAt?: number;
    error?: string | null;
    reason?: string | null;
    message?: string;
    nodeExecutable?: string | null;
    nodeArch?: string | null;
    nativeBinary?: string | null;
    nativeArch?: string | null;
    entrypoint?: string | null;
    pid?: number | null;
    processArch?: string;
    platform?: string;
    health?: unknown;
  };
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

  /**
   * Restarts the desktop stream bridge daemon and returns fresh bridge info.
   */
  restartBridge(): Promise<DesktopBridgeInfo>;

  /**
   * Returns device storage information from the desktop shell.
   */
  getStorageInfo(): Promise<{ total: number; free: number; appUsage?: number }>;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};
