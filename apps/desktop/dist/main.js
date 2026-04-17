"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");

const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");

let tray = null;
let mainWindow = null;

// Ensure download directory exists
const downloadsPath = path.join(electron_1.app.getPath('userData'), 'offline_media');
if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, { recursive: true });
}

function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 720,
        title: "Streamer",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
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
    // Register custom protocol to bypass security sandbox for local downloaded files
    electron_1.protocol.registerFileProtocol('streamer', (request, callback) => {
        const url = request.url.replace('streamer://', '');
        try {
            return callback(decodeURIComponent(url));
        } catch (error) {
            console.error('Protocol error:', error);
        }
    });

    // Set up IPC Handlers
    electron_1.ipcMain.handle('check-file', async (event, localUri) => {
        if (!localUri.startsWith('streamer://')) return false;
        const filePath = decodeURIComponent(localUri.replace('streamer://', ''));
        return fs.existsSync(filePath);
    });

    electron_1.ipcMain.handle('delete-file', async (event, localUri) => {
        if (!localUri.startsWith('streamer://')) return;
        const filePath = decodeURIComponent(localUri.replace('streamer://', ''));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    electron_1.ipcMain.handle('download-media', async (event, id, url, filename) => {
        return new Promise((resolve, reject) => {
            const filePath = path.join(downloadsPath, filename);
            const req = (url.startsWith('https') ? https : http).get(url, (res) => {
                const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
                let writtenBytes = 0;

                const file = fs.createWriteStream(filePath);
                res.pipe(file);

                res.on('data', (chunk) => {
                    writtenBytes += chunk.length;
                    // Throttle updates or send every ~500kb to prevent IPC overload
                    if (writtenBytes % (1024 * 512) < chunk.length) {
                         if (mainWindow && !mainWindow.isDestroyed()) {
                             mainWindow.webContents.send('download-progress', {
                                 id,
                                 totalBytesWritten: writtenBytes,
                                 totalBytesExpectedToWrite: totalBytes
                             });
                         }
                    }
                });

                file.on('finish', () => {
                    file.close();
                    resolve(`streamer://${filePath}`);
                });
            }).on('error', (err) => {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                reject(err.message);
            });
        });
    });

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

