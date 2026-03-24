"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");

let tray = null;
let mainWindow = null;

function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 720,
        title: "Streamer",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    // Load the expo web app (assumes it is running on 8081 for dev)
    mainWindow.loadURL('http://localhost:8081');

    mainWindow.on('close', (event) => {
        if (!electron_1.app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

function createTray() {
    // In a real app, you'd use a bundled icon file.
    // We'll create a simple placeholder or use a native image if available.
    try {
        tray = new electron_1.Tray(electron_1.nativeImage.createEmpty());
        const contextMenu = electron_1.Menu.buildFromTemplate([
            { label: 'Open Streamer', click: () => mainWindow.show() },
            { type: 'separator' },
            { label: 'Quit', click: () => {
                electron_1.app.isQuiting = true;
                electron_1.app.quit();
            }}
        ]);
        tray.setToolTip('Streamer');
        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => mainWindow.show());
    } catch (e) {
        console.warn('Failed to create system tray:', e);
    }
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
    createTray();

    electron_1.app.on('activate', function () {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
        else
            mainWindow.show();
    });
});

electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});

