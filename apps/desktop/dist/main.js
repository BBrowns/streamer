"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");

const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const os = require("os");
const crypto = require("crypto");
const { spawn, execFileSync } = require("child_process");

const { autoUpdater } = require("electron-updater");

let tray = null;
let mainWindow = null;
let bridgeServer = null;
let bridgeLanUrl = 'http://localhost:11470';
let bridgePairingToken = '';

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function checkUpdates() {
    autoUpdater.checkForUpdatesAndNotify();
    
    autoUpdater.on('update-available', () => {
        console.log('[updater] Update available.');
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[updater] Update downloaded; will install on quit');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-ready', info);
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('[updater] Error in auto-updater: ' + err);
    });
}

// Ensure download directory exists
const downloadsPath = path.join(electron_1.app.getPath('userData'), 'offline_media');
if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, { recursive: true });
}

function resolveLanBridgeUrl() {
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
            if (entry.family === 'IPv4' && !entry.internal) {
                return `http://${entry.address}:11470`;
            }
        }
    }
    return 'http://localhost:11470';
}

function readOrCreateBridgePairingToken() {
    const envToken = process.env.STREAMER_BRIDGE_TOKEN?.trim();
    if (envToken) return envToken;

    const tokenPath = path.join(electron_1.app.getPath('userData'), 'bridge-pairing-token');
    try {
        if (fs.existsSync(tokenPath)) {
            const storedToken = fs.readFileSync(tokenPath, 'utf8').trim();
            if (storedToken.length >= 32) return storedToken;
        }

        const token = crypto.randomBytes(32).toString('base64url');
        fs.writeFileSync(tokenPath, token, { mode: 0o600 });
        return token;
    }
    catch (error) {
        console.warn('[stream-server] Could not persist bridge pairing token:', error?.message || error);
        return crypto.randomBytes(32).toString('base64url');
    }
}

function getBridgePairingToken() {
    if (!bridgePairingToken) {
        bridgePairingToken = readOrCreateBridgePairingToken();
    }
    return bridgePairingToken;
}

function resolveBridgeEntrypoint() {
    const candidates = [
        path.resolve(__dirname, '../../../packages/stream-server/dist/index.js'),
        path.resolve(__dirname, '../../packages/stream-server/dist/index.js')
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function uniqueTruthy(values) {
    return [...new Set(values.filter(Boolean))];
}

function resolveNodeBinaryCandidates() {
    const pathCandidates = [];
    for (const searchPath of (process.env.PATH || '').split(path.delimiter)) {
        if (!searchPath) continue;
        pathCandidates.push(path.join(searchPath, process.platform === 'win32' ? 'node.exe' : 'node'));
    }

    return uniqueTruthy([
        process.env.STREAMER_BRIDGE_NODE,
        process.env.npm_node_execpath,
        process.platform === 'darwin' ? '/opt/homebrew/bin/node' : null,
        process.platform === 'darwin' ? '/usr/local/bin/node' : null,
        ...pathCandidates,
        'node'
    ]);
}

function resolveNodeDataChannelBinary() {
    const candidates = [
        path.resolve(__dirname, '../../../node_modules/node-datachannel/build/Release/node_datachannel.node'),
        path.resolve(__dirname, '../../node_modules/node-datachannel/build/Release/node_datachannel.node')
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function detectNativeNodeArch(nativeBinary) {
    if (!nativeBinary || !fs.existsSync(nativeBinary)) return null;

    try {
        if (process.platform === 'darwin') {
            const output = execFileSync('file', [nativeBinary], { encoding: 'utf8' });
            const hasArm64 = output.includes('arm64');
            const hasX64 = output.includes('x86_64');
            if (hasArm64 && hasX64) return null;
            if (hasArm64) return 'arm64';
            if (hasX64) return 'x64';
        }

        if (process.platform === 'linux') {
            const output = execFileSync('file', [nativeBinary], { encoding: 'utf8' }).toLowerCase();
            if (output.includes('aarch64') || output.includes('arm64')) return 'arm64';
            if (output.includes('x86-64') || output.includes('x86_64')) return 'x64';
        }
    } catch (error) {
        console.warn('[stream-server] Could not inspect node-datachannel native binary:', error?.message || error);
    }

    return null;
}

function getNodeArch(nodeExecutable) {
    try {
        return execFileSync(nodeExecutable, ['-p', 'process.arch'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch {
        return null;
    }
}

function resolveNodeExecutable() {
    const nativeArch = detectNativeNodeArch(resolveNodeDataChannelBinary());
    const candidates = resolveNodeBinaryCandidates();

    if (!nativeArch) {
        return candidates[0] || 'node';
    }

    for (const candidate of candidates) {
        const nodeArch = getNodeArch(candidate);
        if (nodeArch === nativeArch) {
            if (candidate !== candidates[0]) {
                console.log(`[stream-server] Selected ${candidate} for bridge runtime because it matches native module arch ${nativeArch}.`);
            }
            return candidate;
        }
    }

    const checked = candidates
        .map((candidate) => `${candidate} (${getNodeArch(candidate) || 'unavailable'})`)
        .join(', ');
    throw new Error(
        `No Node.js runtime matches node-datachannel architecture "${nativeArch}". Checked: ${checked}. Reinstall dependencies under your current Node architecture or set STREAMER_BRIDGE_NODE to a matching Node binary.`
    );
}

async function startBridgeDaemon() {
    const pairingToken = getBridgePairingToken();
    if (process.env.STREAMER_BRIDGE_IN_PROCESS === '1') {
        process.env.STREAMER_BRIDGE_TOKEN = pairingToken;
        const streamServer = await import('@streamer/stream-server');
        return streamServer.startStreamServer(11470);
    }

    const entrypoint = resolveBridgeEntrypoint();
    if (!fs.existsSync(entrypoint)) {
        throw new Error(`Stream server entrypoint not found: ${entrypoint}. Run npm run build --workspace=@streamer/stream-server first.`);
    }

    const nodeExecutable = resolveNodeExecutable();
    const child = spawn(nodeExecutable, [entrypoint], {
        cwd: path.resolve(__dirname, '../../..'),
        env: {
            ...process.env,
            PORT: '11470',
            STREAMER_BRIDGE_TOKEN: pairingToken
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout?.on('data', (chunk) => {
        process.stdout.write(`[stream-server] ${chunk}`);
    });
    child.stderr?.on('data', (chunk) => {
        process.stderr.write(`[stream-server] ${chunk}`);
    });
    child.on('error', (error) => {
        console.error('[stream-server] Failed to start bridge child process:', error);
        bridgeServer = null;
    });
    child.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM') {
            console.warn(`[stream-server] Bridge child process exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
        }
        bridgeServer = null;
    });

    return {
        close: () => {
            if (!child.killed) {
                child.kill('SIGTERM');
            }
        },
        process: child
    };
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
    electron_1.ipcMain.on('handoff-play', (event, data) => {
        if (mainWindow) {
            console.log(`[handoff] Directing UI to play: ${data.title || data.magnet}`);
            
            // Construct the player URL with parameters
            const playerUrl = `http://localhost:8081/player?magnet=${encodeURIComponent(data.magnet)}&startTime=${data.position || 0}&title=${encodeURIComponent(data.title || '')}&itemId=${data.itemId || ''}`;
            
            mainWindow.loadURL(playerUrl);
            mainWindow.show();
            mainWindow.focus();
        }
    });

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

    electron_1.ipcMain.handle('get-bridge-info', async () => ({
        available: !!bridgeServer,
        localUrl: 'http://localhost:11470',
        lanUrl: bridgeLanUrl,
        pairingToken: getBridgePairingToken()
    }));

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

    // Start the background P2P stream server outside Electron main so native
    // Node add-ons load against the same Node architecture used by npm install.
    try {
        bridgeServer = await startBridgeDaemon();
        bridgeLanUrl = resolveLanBridgeUrl();
        console.log(`Successfully started @streamer/stream-server background daemon at ${bridgeLanUrl}`);
        electron_1.app.on('will-quit', () => {
            bridgeServer?.close?.();
        });
        
        // Announce this desktop bridge on the local network via Bonjour
        try {
            const { Bonjour } = await import('bonjour-service');
            const bonjour = new Bonjour();
            const service = bonjour.publish({
                name: `Streamer Desktop (${require('os').hostname()})`,
                type: 'streamer-bridge',
                protocol: 'tcp',
                port: 11470,
                txt: {
                    version: '1.0.0',
                    id: electron_1.app.getPath('userData')
                }
            });
            console.log(`[discovery] Announcing desktop bridge: ${service.name}`);
            
            electron_1.app.on('will-quit', () => {
                bonjour.unpublishAll(() => {
                    bonjour.destroy();
                });
            });
        } catch (discoveryError) {
            console.warn('[discovery] Failed to announce via Bonjour:', discoveryError);
        }
    }
    catch (error) {
        console.error('Failed to start stream server daemon:', error);
    }
    createWindow();
    createTray();
    checkUpdates();

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
