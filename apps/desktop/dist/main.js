"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
function createWindow() {
    const mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    // Load the expo web app (assumes it is running on 8081 for dev)
    // In production, this would load the built static HTML or deployed URL
    mainWindow.loadURL('http://localhost:8081');
}
electron_1.app.whenReady().then(async () => {
    // Start the background P2P stream server
    try {
        await import('@streamer/stream-server');
        console.log('Successfully started @streamer/stream-server background daemon');
    }
    catch (error) {
        console.error('Failed to start stream server daemon:', error);
    }
    createWindow();
    electron_1.app.on('activate', function () {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
