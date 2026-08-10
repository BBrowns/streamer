const { contextBridge, ipcRenderer } = require("electron");

// Sandboxed Electron preloads can only require Electron's builtins. Keep this
// narrow allowlist local instead of importing the main-process security module;
// the main process still owns sender validation and handler registration.
const INVOKE_IPC_CHANNELS = Object.freeze([
  "check-file",
  "inspect-file",
  "delete-file",
  "get-bridge-info",
  "refresh-bridge-access-session",
  "restart-bridge",
  "get-storage-info",
  "get-update-status",
  "check-for-updates",
  "open-update-page",
  "download-media",
  "download-job-start",
  "download-job-get",
  "download-job-pause",
  "download-job-resume",
  "download-job-cancel",
]);

const SUBSCRIBE_IPC_CHANNELS = Object.freeze([
  "download-progress",
  "update-status-changed",
]);

function safeInvoke(channel, ...args) {
  if (!INVOKE_IPC_CHANNELS.includes(channel)) {
    throw new Error(`IPC channel is not allowlisted: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, callback) {
  if (!SUBSCRIBE_IPC_CHANNELS.includes(channel)) {
    throw new Error(`IPC subscription is not allowlisted: ${channel}`);
  }
  if (typeof callback !== "function") {
    return () => {};
  }

  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("desktopBridge", {
  downloadMedia: (id, url, filename) =>
    safeInvoke("download-media", id, url, filename),
  startDownloadJob: (id, url, filename) =>
    safeInvoke("download-job-start", id, url, filename),
  getDownloadJob: (id) => safeInvoke("download-job-get", id),
  pauseDownloadJob: (id) => safeInvoke("download-job-pause", id),
  resumeDownloadJob: (id) => safeInvoke("download-job-resume", id),
  cancelDownloadJob: (id) => safeInvoke("download-job-cancel", id),
  checkFile: (localUri) => safeInvoke("check-file", localUri),
  inspectFile: (localUri) => safeInvoke("inspect-file", localUri),
  deleteFile: (localUri) => safeInvoke("delete-file", localUri),
  getBridgeInfo: () => safeInvoke("get-bridge-info"),
  refreshBridgeAccessSession: () => safeInvoke("refresh-bridge-access-session"),
  restartBridge: () => safeInvoke("restart-bridge"),
  getStorageInfo: () => safeInvoke("get-storage-info"),
  getUpdateStatus: () => safeInvoke("get-update-status"),
  checkForUpdates: () => safeInvoke("check-for-updates"),
  openUpdatePage: () => safeInvoke("open-update-page"),
  onDownloadProgress: (callback) => subscribe("download-progress", callback),
  onUpdateStatus: (callback) => subscribe("update-status-changed", callback),
});
