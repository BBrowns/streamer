const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
    downloadMedia: (id, url, filename) => ipcRenderer.invoke('download-media', id, url, filename),
    checkFile: (localUri) => ipcRenderer.invoke('check-file', localUri),
    deleteFile: (localUri) => ipcRenderer.invoke('delete-file', localUri),
    getBridgeInfo: () => ipcRenderer.invoke('get-bridge-info'),
    onDownloadProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('download-progress', handler);
        return () => ipcRenderer.removeListener('download-progress', handler);
    }
});
