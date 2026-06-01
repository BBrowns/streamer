const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
    downloadMedia: (id, url, filename) => ipcRenderer.invoke('download-media', id, url, filename),
    startDownloadJob: (id, url, filename) => ipcRenderer.invoke('download-job-start', id, url, filename),
    getDownloadJob: (id) => ipcRenderer.invoke('download-job-get', id),
    pauseDownloadJob: (id) => ipcRenderer.invoke('download-job-pause', id),
    resumeDownloadJob: (id) => ipcRenderer.invoke('download-job-resume', id),
    cancelDownloadJob: (id) => ipcRenderer.invoke('download-job-cancel', id),
    checkFile: (localUri) => ipcRenderer.invoke('check-file', localUri),
    deleteFile: (localUri) => ipcRenderer.invoke('delete-file', localUri),
    getBridgeInfo: () => ipcRenderer.invoke('get-bridge-info'),
    onDownloadProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('download-progress', handler);
        return () => ipcRenderer.removeListener('download-progress', handler);
    }
});
