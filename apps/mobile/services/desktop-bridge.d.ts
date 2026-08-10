import type { BuildMetadata } from "@streamer/shared";

export interface DesktopDownloadProgressData {
  id: string;
  status?: DesktopDownloadJobStatus;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  localUri?: string;
  contentType?: string;
  metadataBytes?: number;
  error?: string;
  failureReason?: DesktopDownloadFailureReason;
  requiresReplan?: boolean;
}

export type DesktopDownloadJobStatus =
  | "Pending"
  | "Downloading"
  | "Paused"
  | "Completed"
  | "Error"
  | "Canceled";

export type DesktopDownloadFailureReason =
  | "source_access_expired"
  | "source_unavailable"
  | "invalid_source"
  | "redirect_limit"
  | "network_timeout"
  | "local_storage_failed"
  | "file_missing"
  | "interrupted"
  | "download_failed";

export interface DesktopDownloadJob {
  id: string;
  status: DesktopDownloadJobStatus;
  filename: string;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
  localUri?: string;
  contentType?: string;
  metadataBytes?: number;
  error?: string;
  failureReason?: DesktopDownloadFailureReason;
  requiresReplan?: boolean;
}

export type DesktopBridgeSelfTestStatus = "pass" | "warn" | "fail";

export interface DesktopBridgeSelfTestCheck {
  name: string;
  status: DesktopBridgeSelfTestStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface DesktopBridgeSelfTest {
  status: DesktopBridgeSelfTestStatus;
  checkedAt?: number;
  summary?: string;
  checks?: DesktopBridgeSelfTestCheck[];
}

export interface DesktopBridgeRepairPlan {
  required: boolean;
  reason?: string;
  title?: string;
  detail?: string;
  actionLabel?: string;
  steps?: string[];
}

export interface DesktopBridgeRuntimeInfo {
  owner?: string;
  pid?: number;
  nodeVersion?: string;
  nodeArch?: string;
  nativeArch?: string;
  processArch?: string;
  platform?: string;
  architectureMismatch?: boolean;
}

export interface DesktopBridgeHealthPayload {
  status?: string;
  torrentEngine?: {
    available?: boolean;
    state?: string;
    reason?: string;
    message?: string;
    processArch?: string;
    platform?: string;
  };
  remuxRuntime?: {
    available?: boolean;
    state?: string;
    binaryPath?: string;
    version?: string;
    reason?: string;
    message?: string;
    processArch?: string;
    platform?: string;
  };
  remuxCache?: {
    rootDir?: string;
    entryCount?: number;
    pendingCount?: number;
    totalBytes?: number;
    maxBytes?: number;
    ttlMs?: number;
  };
  torrentCache?: {
    rootDir?: string;
    entryCount?: number;
    totalBytes?: number;
    maxBytes?: number;
    ttlMs?: number;
  };
  runtime?: DesktopBridgeRuntimeInfo;
  selfTest?: DesktopBridgeSelfTest;
  repair?: DesktopBridgeRepairPlan;
  build?: BuildMetadata;
}

export interface DesktopBridgeInfo {
  available: boolean;
  localUrl: string;
  lanUrl: string;
  accessSession?: {
    accessToken: string;
    expiresAt: string;
  };
  build?: BuildMetadata;
  desktopRuntime?: {
    productVersion: string;
    electronVersion: string;
  };
  diagnostics?: {
    status?: "starting" | "running" | "stopped" | "error";
    startedAt?: number | null;
    updatedAt?: number;
    reason?: string | null;
    message?: string;
    processArch?: string;
    platform?: string;
    selfTest?: DesktopBridgeSelfTest;
    repair?: DesktopBridgeRepairPlan;
    build?: BuildMetadata;
  };
}

export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloaded"
  | "unsupported"
  | "error";

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  currentVersion: string;
  latestVersion?: string | null;
  releaseName?: string | null;
  releaseDate?: string | null;
  error?: string | null;
  checkedAt?: number | null;
  releasesUrl: string;
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

  /** Returns safe metadata for a managed download without exposing its path. */
  inspectFile?(localUri: string): Promise<{
    exists: boolean;
    isFile: boolean;
    sizeBytes: number;
  }>;

  /**
   * Deletes a downloaded file from the user's local disk.
   */
  deleteFile(localUri: string): Promise<void>;

  /**
   * Returns the local and LAN bridge URLs exposed by the desktop shell.
   */
  getBridgeInfo(): Promise<DesktopBridgeInfo>;

  /** Rotates the renderer's short-lived, scope-limited bridge session. */
  refreshBridgeAccessSession?(): Promise<
    DesktopBridgeInfo["accessSession"] | null
  >;

  /**
   * Restarts the desktop stream bridge daemon and returns fresh bridge info.
   */
  restartBridge(): Promise<DesktopBridgeInfo>;

  /**
   * Returns device storage information (total, free, and optional app usage bytes).
   */
  getStorageInfo(): Promise<{
    total: number;
    free: number;
    appUsage?: number;
    /** False when the desktop shell could not read statfs diagnostics. */
    known?: boolean;
  }>;

  /**
   * Reads the current desktop update status without starting a new check.
   */
  getUpdateStatus?(): Promise<DesktopUpdateState>;

  /**
   * Manually checks for desktop updates. Does not download or install updates.
   */
  checkForUpdates?(): Promise<DesktopUpdateState>;

  /**
   * Opens the configured release page in the system browser.
   */
  openUpdatePage?(): Promise<DesktopUpdateState>;

  /**
   * Subscribes to desktop update state changes.
   */
  onUpdateStatus?(callback: (data: DesktopUpdateState) => void): () => void;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
