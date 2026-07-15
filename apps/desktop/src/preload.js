const { contextBridge, ipcRenderer } = require("electron");

function safeInvoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, callback) {
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
  restartBridge: () => safeInvoke("restart-bridge"),
  getStorageInfo: () => safeInvoke("get-storage-info"),
  getUpdateStatus: () => safeInvoke("get-update-status"),
  checkForUpdates: () => safeInvoke("check-for-updates"),
  openUpdatePage: () => safeInvoke("open-update-page"),
  onDownloadProgress: (callback) => subscribe("download-progress", callback),
  onUpdateStatus: (callback) => subscribe("update-status-changed", callback),
});
