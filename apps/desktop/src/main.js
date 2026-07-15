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
const {
  resolveManagedDownloadPath,
  toStreamerUri,
} = require("./download-paths");
const {
  INVOKE_IPC_CHANNELS,
  SEND_IPC_CHANNELS,
  createContentSecurityPolicy,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
  normalizeDownloadIpcArgs,
  normalizeHandoffPayload,
  normalizeIpcId,
  normalizeLocalUri,
} = require("./security");
const {
  resolveBridgeEntrypointPath,
  resolveBridgeWorkingDirectoryPath,
  resolveNodeBinaryCandidatePaths,
  resolveNodeDataChannelBinaryPath,
} = require("./bridge-runtime");
const {
  captureDesktopException,
  captureDesktopMessage,
  flushDesktopSentry,
  initDesktopSentry,
  redactSensitiveText,
} = require("./sentry");
const { createDesktopBuildMetadata } = require("./build-metadata");

const { autoUpdater } = require("electron-updater");
const RELEASES_URL =
  process.env.STREAMER_RELEASES_URL ||
  "https://github.com/BBrowns/streamer/releases";

const desktopPackageVersion = require("../package.json").version;
const desktopProductVersion = electron_1.app.isPackaged
  ? electron_1.app.getVersion()
  : desktopPackageVersion;

const desktopBuildMetadata = createDesktopBuildMetadata(process.env, {
  appVersion: desktopProductVersion,
});
const desktopRuntime = {
  productVersion: desktopBuildMetadata.appVersion,
  electronVersion: process.versions.electron || "unknown",
};
const disableBridgeForDesktopSmoke =
  !electron_1.app.isPackaged &&
  process.env.STREAMER_DESKTOP_SMOKE_DISABLE_BRIDGE === "true";

initDesktopSentry(desktopBuildMetadata);
console.log(
  JSON.stringify({
    service: "streamer-desktop-main",
    event: "started",
    build: desktopBuildMetadata,
  }),
);

let tray = null;
let mainWindow = null;
let bridgeServer = null;
let bridgeLanUrl = "http://localhost:11470";
let bridgePairingToken = "";
let bridgeStartSequence = 0;
let bridgeState = {
  status: "stopped",
  startedAt: null,
  updatedAt: Date.now(),
  error: null,
  reason: null,
  nodeExecutable: null,
  nodeArch: null,
  nativeBinary: null,
  nativeArch: null,
  entrypoint: null,
  pid: null,
};
const downloadJobs = new Map();
let updateCheckPromise = null;
let updateState = {
  status: "idle",
  currentVersion: desktopBuildMetadata.appVersion,
  latestVersion: null,
  releaseName: null,
  releaseDate: null,
  error: null,
  checkedAt: null,
  releasesUrl: RELEASES_URL,
};

process.on("uncaughtExceptionMonitor", (error) => {
  captureDesktopException(error, {
    component: "electron-main",
    kind: "uncaught-exception",
  });
});

// Updates are intentionally manual for the first production release path.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function snapshotUpdateState() {
  return { ...updateState };
}

function publishUpdateState(patch) {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: desktopBuildMetadata.appVersion,
    releasesUrl: RELEASES_URL,
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-status-changed", snapshotUpdateState());
  }
}

function updateStateFromInfo(status, info) {
  publishUpdateState({
    status,
    latestVersion: info?.version || null,
    releaseName: info?.releaseName || null,
    releaseDate: info?.releaseDate || null,
    error: null,
    checkedAt: Date.now(),
  });
}

function configureUpdateChecks() {
  autoUpdater.on("checking-for-update", () => {
    publishUpdateState({ status: "checking", error: null });
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] Update available.");
    updateStateFromInfo("available", info);
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[updater] No update available.");
    updateStateFromInfo("current", info);
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateStateFromInfo("downloaded", info);
  });

  autoUpdater.on("error", (err) => {
    captureDesktopException(err, { component: "auto-updater" });
    publishUpdateState({
      status: "error",
      error: redactSensitiveText(err?.message || err),
      checkedAt: Date.now(),
    });
    console.error(
      "[updater] Error in update check: " + redactSensitiveText(err),
    );
  });
}

async function checkForDesktopUpdates() {
  if (!electron_1.app.isPackaged) {
    publishUpdateState({
      status: "unsupported",
      error: "Update checks are available in packaged desktop builds.",
      checkedAt: Date.now(),
    });
    return snapshotUpdateState();
  }

  if (updateCheckPromise) return updateCheckPromise;

  updateCheckPromise = autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (result?.updateInfo) {
        const isAvailable =
          result.updateInfo.version &&
          result.updateInfo.version !== desktopBuildMetadata.appVersion;
        updateStateFromInfo(
          isAvailable ? "available" : "current",
          result.updateInfo,
        );
      }
      return snapshotUpdateState();
    })
    .finally(() => {
      updateCheckPromise = null;
    });

  return updateCheckPromise;
}

// Ensure download directory exists
const downloadsPath = path.join(
  electron_1.app.getPath("userData"),
  "offline_media",
);
if (!fs.existsSync(downloadsPath)) {
  fs.mkdirSync(downloadsPath, { recursive: true });
}

function getDirectorySizeBytes(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    try {
      if (entry.isDirectory()) {
        total += getDirectorySizeBytes(entryPath);
      } else if (entry.isFile()) {
        total += fs.statSync(entryPath).size;
      }
    } catch {
      // Best-effort diagnostics only; ignore files that disappear mid-scan.
    }
  }

  return total;
}

function getStorageInfo() {
  const info = {
    total: 0,
    free: 0,
    appUsage: getDirectorySizeBytes(downloadsPath),
  };

  try {
    const stats = fs.statfsSync(downloadsPath);
    const blockSize = Number(stats.bsize || 0);
    info.total = Number(stats.blocks || 0) * blockSize;
    info.free = Number(stats.bavail || 0) * blockSize;
  } catch (error) {
    console.warn(
      "[downloads] Failed to read storage info:",
      redactSensitiveText(error?.message || error),
    );
  }

  return info;
}

const downloadJobsPath = path.join(downloadsPath, "download-jobs.json");
let persistDownloadJobsTimer = null;

function sanitizeDownloadFilename(filename) {
  const fallback = `download-${Date.now()}.mp4`;
  const baseName = path.basename(String(filename || fallback));
  const sanitized = baseName.replace(/[^a-z0-9._-]/gi, "_").slice(0, 180);
  return sanitized || fallback;
}

function snapshotDownloadJob(job) {
  return {
    id: job.id,
    status: job.status,
    downloadUrl: job.downloadUrl,
    filename: job.filename,
    totalBytesWritten: job.totalBytesWritten,
    totalBytesExpectedToWrite: job.totalBytesExpectedToWrite,
    localUri: job.localUri || undefined,
    contentType: job.contentType || undefined,
    metadataBytes: Math.max(0, Number(job.metadataBytes) || 0),
    error: job.error || undefined,
  };
}

function serializeDownloadJob(job) {
  return {
    id: job.id,
    status: job.status,
    downloadUrl: job.downloadUrl,
    filename: job.filename,
    totalBytesWritten: job.totalBytesWritten,
    totalBytesExpectedToWrite: job.totalBytesExpectedToWrite,
    localUri: job.localUri || undefined,
    contentType: job.contentType || undefined,
    metadataBytes: Math.max(0, Number(job.metadataBytes) || 0),
    error: job.error || undefined,
  };
}

function persistDownloadJobsNow() {
  if (persistDownloadJobsTimer) {
    clearTimeout(persistDownloadJobsTimer);
    persistDownloadJobsTimer = null;
  }

  const jobs = Array.from(downloadJobs.values()).map(serializeDownloadJob);
  const tempPath = `${downloadJobsPath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify({ version: 1, jobs }), {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(tempPath, downloadJobsPath);
  } catch (error) {
    captureDesktopException(error, {
      component: "downloads",
      action: "persist",
    });
    console.warn(
      "[downloads] Failed to persist download jobs:",
      redactSensitiveText(error?.message || error),
    );
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {}
  }
}

function schedulePersistDownloadJobs() {
  if (persistDownloadJobsTimer) return;
  persistDownloadJobsTimer = setTimeout(persistDownloadJobsNow, 500);
}

function restoreDownloadJobs() {
  if (!fs.existsSync(downloadJobsPath)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(downloadJobsPath, "utf8"));
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];

    for (const storedJob of jobs) {
      if (
        !storedJob ||
        typeof storedJob.id !== "string" ||
        typeof storedJob.downloadUrl !== "string" ||
        typeof storedJob.filename !== "string"
      ) {
        continue;
      }

      const filename = sanitizeDownloadFilename(storedJob.filename);
      const filePath = path.join(downloadsPath, filename);
      const tempPath = `${filePath}.part`;
      const completedFileExists = fs.existsSync(filePath);
      const partialFileExists = fs.existsSync(tempPath);
      const storedStatus = storedJob.status;
      const status =
        storedStatus === "Completed"
          ? completedFileExists
            ? "Completed"
            : "Error"
          : storedStatus === "Error"
            ? "Error"
            : "Paused";
      const totalBytesWritten = partialFileExists
        ? fs.statSync(tempPath).size
        : completedFileExists
          ? fs.statSync(filePath).size
          : Math.max(0, Number(storedJob.totalBytesWritten) || 0);

      downloadJobs.set(storedJob.id, {
        id: storedJob.id,
        downloadUrl: storedJob.downloadUrl,
        filename,
        filePath,
        tempPath,
        status,
        totalBytesWritten,
        totalBytesExpectedToWrite: Math.max(
          totalBytesWritten,
          Number(storedJob.totalBytesExpectedToWrite) || 0,
        ),
        localUri: completedFileExists ? toStreamerUri(filePath) : null,
        contentType: storedJob.contentType || null,
        metadataBytes: Math.max(0, Number(storedJob.metadataBytes) || 0),
        error:
          status === "Error"
            ? storedJob.error || "Downloaded file could not be found."
            : null,
        req: null,
        file: null,
        pauseRequested: false,
        cancelRequested: false,
        waiters: [],
      });
    }
  } catch (error) {
    captureDesktopException(error, {
      component: "downloads",
      action: "restore",
    });
    console.warn(
      "[downloads] Failed to restore download jobs:",
      redactSensitiveText(error?.message || error),
    );
  }
}

restoreDownloadJobs();
electron_1.app.on("will-quit", persistDownloadJobsNow);
electron_1.app.on("will-quit", () => {
  void flushDesktopSentry(2000);
});

function emitDownloadJob(job) {
  const snapshot = snapshotDownloadJob(job);
  schedulePersistDownloadJobs();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("download-progress", snapshot);
    mainWindow.webContents.send("download-job-updated", snapshot);
  }
}

function settleDownloadJob(job) {
  if (!job.waiters?.length) return;
  const waiters = job.waiters.splice(0);
  for (const waiter of waiters) {
    if (job.status === "Completed" && job.localUri) {
      waiter.resolve(job.localUri);
    } else {
      waiter.reject(
        new Error(job.error || `Download ${job.status.toLowerCase()}`),
      );
    }
  }
}

function failDownloadJob(job, error) {
  job.status = "Error";
  job.error = error?.message || String(error);
  job.req = null;
  job.file = null;
  emitDownloadJob(job);
  settleDownloadJob(job);
}

function completeDownloadJob(job) {
  job.status = "Completed";
  job.localUri = toStreamerUri(job.filePath);
  job.error = null;
  job.req = null;
  job.file = null;
  emitDownloadJob(job);
  settleDownloadJob(job);
}

function parseContentRangeTotal(contentRange) {
  if (!contentRange) return 0;
  const match = String(contentRange).match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function startDownloadRequest(job, resumeAt = 0, redirectCount = 0) {
  let parsedUrl;
  try {
    parsedUrl = new URL(job.downloadUrl);
  } catch {
    failDownloadJob(job, new Error("Download URL is invalid"));
    return;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    failDownloadJob(job, new Error("Download URL must use HTTP or HTTPS"));
    return;
  }

  let startByte = Math.max(0, resumeAt);
  if (startByte > 0 && fs.existsSync(job.tempPath)) {
    startByte = fs.statSync(job.tempPath).size;
  } else if (startByte > 0) {
    startByte = 0;
  }

  job.status = "Downloading";
  job.error = null;
  job.pauseRequested = false;
  job.cancelRequested = false;
  job.totalBytesWritten = startByte;
  emitDownloadJob(job);

  const client = parsedUrl.protocol === "https:" ? https : http;
  const options =
    startByte > 0 ? { headers: { Range: `bytes=${startByte}-` } } : {};
  const req = client.get(parsedUrl, options, (res) => {
    const statusCode = res.statusCode || 0;
    const location = res.headers.location;

    if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
      res.resume();
      if (redirectCount >= 5) {
        failDownloadJob(job, new Error("Too many download redirects"));
        return;
      }
      job.downloadUrl = new URL(location, parsedUrl).toString();
      startDownloadRequest(job, startByte, redirectCount + 1);
      return;
    }

    if (startByte > 0 && statusCode === 200) {
      startByte = 0;
      job.totalBytesWritten = 0;
    }

    if (statusCode === 416) {
      res.resume();
      try {
        fs.rmSync(job.tempPath, { force: true });
      } catch {}
      startDownloadRequest(job, 0, redirectCount);
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      res.resume();
      failDownloadJob(
        job,
        new Error(`Download failed with HTTP ${statusCode}`),
      );
      return;
    }

    const contentLength = parseInt(res.headers["content-length"] || "0", 10);
    const rangeTotal = parseContentRangeTotal(res.headers["content-range"]);
    job.totalBytesExpectedToWrite =
      rangeTotal || (contentLength ? contentLength + startByte : 0);
    job.contentType = Array.isArray(res.headers["content-type"])
      ? res.headers["content-type"][0]
      : res.headers["content-type"] || null;

    const file = fs.createWriteStream(job.tempPath, {
      flags: startByte > 0 ? "a" : "w",
    });
    job.file = file;

    const fail = (error) => {
      if (job.pauseRequested || job.cancelRequested) return;
      failDownloadJob(
        job,
        error instanceof Error ? error : new Error(String(error)),
      );
    };

    res.on("data", (chunk) => {
      job.totalBytesWritten += chunk.length;
      if (job.totalBytesWritten % (1024 * 512) < chunk.length) {
        emitDownloadJob(job);
      }
    });

    res.on("error", fail);
    file.on("error", fail);
    file.on("finish", () => {
      if (
        job.pauseRequested ||
        job.cancelRequested ||
        job.status !== "Downloading"
      ) {
        return;
      }

      file.close((closeError) => {
        if (closeError) {
          failDownloadJob(job, closeError);
          return;
        }
        fs.rename(job.tempPath, job.filePath, (error) => {
          if (error) {
            failDownloadJob(job, error);
            return;
          }
          job.totalBytesExpectedToWrite =
            job.totalBytesExpectedToWrite || job.totalBytesWritten;
          completeDownloadJob(job);
        });
      });
    });

    res.pipe(file);
  });

  job.req = req;
  req.setTimeout(30_000, () => {
    req.destroy(new Error("Download timed out"));
  });

  req.on("error", (err) => {
    if (job.pauseRequested || job.cancelRequested) return;
    failDownloadJob(job, err instanceof Error ? err : new Error(String(err)));
  });
}

function startDownloadJob(id, rawUrl, filename) {
  let existingJob = downloadJobs.get(id);
  if (
    existingJob?.status === "Completed" &&
    !fs.existsSync(existingJob.filePath)
  ) {
    downloadJobs.delete(id);
    schedulePersistDownloadJobs();
    existingJob = null;
  }
  if (
    existingJob &&
    ["Pending", "Downloading", "Paused", "Completed"].includes(
      existingJob.status,
    )
  ) {
    return snapshotDownloadJob(existingJob);
  }

  const safeFilename = sanitizeDownloadFilename(filename);
  const filePath = path.join(downloadsPath, safeFilename);
  const tempPath = `${filePath}.part`;
  const job = {
    id,
    downloadUrl: rawUrl,
    filename: safeFilename,
    filePath,
    tempPath,
    status: "Pending",
    totalBytesWritten: 0,
    totalBytesExpectedToWrite: 0,
    localUri: null,
    contentType: null,
    metadataBytes: 0,
    error: null,
    req: null,
    file: null,
    pauseRequested: false,
    cancelRequested: false,
    waiters: [],
  };

  downloadJobs.set(id, job);
  schedulePersistDownloadJobs();
  startDownloadRequest(job, 0);
  return snapshotDownloadJob(job);
}

function pauseDownloadJob(id) {
  const job = downloadJobs.get(id);
  if (!job) return null;

  if (job.status === "Downloading" || job.status === "Pending") {
    job.pauseRequested = true;
    job.status = "Paused";
    job.req?.destroy();
    job.file?.destroy();
    if (fs.existsSync(job.tempPath)) {
      job.totalBytesWritten = fs.statSync(job.tempPath).size;
    }
    emitDownloadJob(job);
  }

  return snapshotDownloadJob(job);
}

function resumeDownloadJob(id) {
  const job = downloadJobs.get(id);
  if (!job) return null;

  if (job.status === "Paused" || job.status === "Error") {
    const resumeAt = fs.existsSync(job.tempPath)
      ? fs.statSync(job.tempPath).size
      : 0;
    startDownloadRequest(job, resumeAt);
  }

  return snapshotDownloadJob(job);
}

function cancelDownloadJob(id) {
  const job = downloadJobs.get(id);
  if (!job) return null;

  job.cancelRequested = true;
  job.status = "Canceled";
  job.req?.destroy();
  job.file?.destroy();
  try {
    fs.rmSync(job.tempPath, { force: true });
  } catch {}
  emitDownloadJob(job);
  settleDownloadJob(job);
  downloadJobs.delete(id);
  schedulePersistDownloadJobs();
  return snapshotDownloadJob(job);
}

function waitForDownloadJobCompletion(id) {
  const job = downloadJobs.get(id);
  if (!job) return Promise.reject(new Error("Download job not found"));
  if (job.status === "Completed" && job.localUri)
    return Promise.resolve(job.localUri);
  if (job.status === "Error" || job.status === "Canceled") {
    return Promise.reject(
      new Error(job.error || `Download ${job.status.toLowerCase()}`),
    );
  }
  return new Promise((resolve, reject) => {
    job.waiters.push({ resolve, reject });
  });
}

function downloadMediaFile(id, rawUrl, filename) {
  startDownloadJob(id, rawUrl, filename);
  return waitForDownloadJobCompletion(id);
}

function shouldAllowDevRendererServer() {
  return (
    !electron_1.app.isPackaged ||
    process.env.STREAMER_DESKTOP_ALLOW_DEV_RENDERER === "true"
  );
}

function getAllowedRendererFileRoots() {
  const roots = [path.join(__dirname, "renderer"), path.join(__dirname, "web")];
  if (process.resourcesPath) {
    roots.push(
      path.join(process.resourcesPath, "renderer"),
      path.join(process.resourcesPath, "web"),
    );
  }
  return roots;
}

function getRendererSecurityOptions() {
  return {
    allowDevServer: shouldAllowDevRendererServer(),
    allowedFileRoots: getAllowedRendererFileRoots(),
  };
}

function isTrustedRendererUrl(url) {
  return isAllowedRendererUrl(url, getRendererSecurityOptions());
}

function assertTrustedIpcSender(event) {
  const senderUrl =
    event?.senderFrame?.url || event?.sender?.getURL?.() || "about:blank";
  if (!isTrustedRendererUrl(senderUrl)) {
    captureDesktopMessage("Blocked IPC from untrusted renderer", {
      component: "electron-security",
      action: "ipc-blocked",
      senderUrl,
    });
    throw new Error("Blocked IPC from untrusted renderer");
  }
}

function handleTrusted(channel, handler) {
  if (!INVOKE_IPC_CHANNELS.includes(channel)) {
    throw new Error(`IPC channel is not allowlisted: ${channel}`);
  }

  electron_1.ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpcSender(event);
    return handler(event, ...args);
  });
}

function onTrusted(channel, handler) {
  if (!SEND_IPC_CHANNELS.includes(channel)) {
    throw new Error(`IPC channel is not allowlisted: ${channel}`);
  }

  electron_1.ipcMain.on(channel, (event, ...args) => {
    assertTrustedIpcSender(event);
    return handler(event, ...args);
  });
}

function openSafeExternalUrl(url) {
  if (!isAllowedExternalUrl(url)) {
    console.warn("[electron-security] Blocked external URL open");
    return;
  }

  electron_1.shell.openExternal(url).catch((error) => {
    captureDesktopException(error, {
      component: "electron-security",
      action: "open-external",
    });
  });
}

function configureElectronSecurity() {
  electron_1.session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  electron_1.session.defaultSession.setPermissionCheckHandler(() => false);

  electron_1.session.defaultSession.webRequest.onHeadersReceived(
    (details, callback) => {
      const responseHeaders = {
        ...details.responseHeaders,
      };

      if (isTrustedRendererUrl(details.url)) {
        responseHeaders["Content-Security-Policy"] = [
          createContentSecurityPolicy({
            allowDevServer: shouldAllowDevRendererServer(),
          }),
        ];
      }

      callback({ responseHeaders });
    },
  );

  electron_1.app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event, webPreferences) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      event.preventDefault();
    });

    contents.on("will-navigate", (event, navigationUrl) => {
      if (!isTrustedRendererUrl(navigationUrl)) {
        event.preventDefault();
      }
    });

    contents.on("will-redirect", (event, navigationUrl) => {
      if (!isTrustedRendererUrl(navigationUrl)) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      openSafeExternalUrl(url);
      return { action: "deny" };
    });
  });
}

function getRendererBaseUrl() {
  return process.env.STREAMER_DESKTOP_RENDERER_URL || "http://localhost:8081";
}

function buildRendererUrl(pathname = "/", params = {}) {
  const url = new URL(pathname, getRendererBaseUrl());
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  if (!isTrustedRendererUrl(url.toString())) {
    throw new Error("Renderer URL is not allowed by desktop security policy");
  }
  return url.toString();
}

function resolveLanBridgeUrl() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return `http://${entry.address}:11470`;
      }
    }
  }
  return "http://localhost:11470";
}

function getBridgeOwnerClaimPath() {
  return (
    process.env.STREAMER_BRIDGE_CLAIM_FILE ||
    path.join(os.tmpdir(), "streamer-bridge-owner.json")
  );
}

function writeBridgeOwnerClaim(reason) {
  const claim = {
    owner: "desktop",
    pid: process.pid,
    port: 11470,
    reason,
    updatedAt: Date.now(),
    platform: process.platform,
    arch: process.arch,
  };

  try {
    fs.writeFileSync(getBridgeOwnerClaimPath(), JSON.stringify(claim), {
      mode: 0o600,
    });
  } catch (error) {
    console.warn(
      "[stream-server] Could not write bridge ownership claim:",
      error?.message || error,
    );
  }
}

function clearBridgeOwnerClaim() {
  try {
    const claimPath = getBridgeOwnerClaimPath();
    if (!fs.existsSync(claimPath)) return;

    const claim = JSON.parse(fs.readFileSync(claimPath, "utf8"));
    if (claim?.owner === "desktop" && claim?.pid === process.pid) {
      fs.rmSync(claimPath, { force: true });
    }
  } catch {
    // Best-effort cleanup only.
  }
}

function killBridgePortProcesses() {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return;
  }

  try {
    const output = execFileSync("lsof", ["-ti", ":11470"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pids = output
      .split(/\s+/)
      .map((pid) => Number(pid))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);

    for (const pid of pids) {
      try {
        process.kill(pid, "SIGKILL");
        console.log(`[stream-server] Cleared stale bridge process ${pid}`);
      } catch {
        // Process may have exited between lsof and kill.
      }
    }
  } catch {
    // No process was listening on the bridge port.
  }
}

function getBridgeHealthOwner(health) {
  return health?.runtime?.owner || null;
}

function readOrCreateBridgePairingToken() {
  const envToken = process.env.STREAMER_BRIDGE_TOKEN?.trim();
  if (envToken) return envToken;

  const tokenPath = path.join(
    electron_1.app.getPath("userData"),
    "bridge-pairing-token",
  );
  try {
    if (fs.existsSync(tokenPath)) {
      const storedToken = fs.readFileSync(tokenPath, "utf8").trim();
      if (storedToken.length >= 32) return storedToken;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(tokenPath, token, { mode: 0o600 });
    return token;
  } catch (error) {
    console.warn(
      "[stream-server] Could not persist bridge pairing token:",
      error?.message || error,
    );
    return crypto.randomBytes(32).toString("base64url");
  }
}

function getBridgePairingToken() {
  if (!bridgePairingToken) {
    bridgePairingToken = readOrCreateBridgePairingToken();
  }
  return bridgePairingToken;
}

function resolveBridgeEntrypoint() {
  return resolveBridgeEntrypointPath({
    dirname: __dirname,
    env: process.env,
    exists: fs.existsSync,
    resourcesPath: process.resourcesPath,
  });
}

function resolveNodeBinaryCandidates() {
  return resolveNodeBinaryCandidatePaths({
    dirname: __dirname,
    env: process.env,
    exists: fs.existsSync,
    homeDir: os.homedir(),
    isPackaged: electron_1.app.isPackaged,
    pathEnv: process.env.PATH || "",
    platform: process.platform,
    readdir: fs.readdirSync,
    resourcesPath: process.resourcesPath,
  });
}

function resolveNodeDataChannelBinary() {
  return resolveNodeDataChannelBinaryPath({
    dirname: __dirname,
    exists: fs.existsSync,
    resourcesPath: process.resourcesPath,
  });
}

function detectNativeNodeArch(nativeBinary) {
  if (!nativeBinary || !fs.existsSync(nativeBinary)) return null;

  try {
    if (process.platform === "darwin") {
      const output = execFileSync("file", [nativeBinary], { encoding: "utf8" });
      const hasArm64 = output.includes("arm64");
      const hasX64 = output.includes("x86_64");
      if (hasArm64 && hasX64) return null;
      if (hasArm64) return "arm64";
      if (hasX64) return "x64";
    }

    if (process.platform === "linux") {
      const output = execFileSync("file", [nativeBinary], {
        encoding: "utf8",
      }).toLowerCase();
      if (output.includes("aarch64") || output.includes("arm64"))
        return "arm64";
      if (output.includes("x86-64") || output.includes("x86_64")) return "x64";
    }
  } catch (error) {
    console.warn(
      "[stream-server] Could not inspect node-datachannel native binary:",
      error?.message || error,
    );
  }

  return null;
}

function getNodeArch(nodeExecutable) {
  if (nodeExecutable === process.execPath) return process.arch;
  try {
    return execFileSync(nodeExecutable, ["-p", "process.arch"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function classifyBridgeError(error) {
  const message = String(error?.message || error || "");
  if (
    message.includes("No Node.js runtime matches node-datachannel architecture")
  ) {
    return "native-architecture-mismatch";
  }
  if (
    message.includes("node-datachannel") ||
    message.includes("node_datachannel.node")
  ) {
    return "native-load-failed";
  }
  if (message.includes("Stream server entrypoint not found")) {
    return "missing-stream-server-build";
  }
  return "bridge-start-failed";
}

function setBridgeState(patch) {
  bridgeState = {
    ...bridgeState,
    ...patch,
    updatedAt: Date.now(),
  };
}

function getBridgeRuntimeDiagnostics() {
  const nativeBinary = resolveNodeDataChannelBinary();
  const nativeArch = detectNativeNodeArch(nativeBinary);
  return {
    nativeBinary,
    nativeArch,
    processArch: process.arch,
    platform: process.platform,
  };
}

function resolveNodeExecutable() {
  const nativeBinary = resolveNodeDataChannelBinary();
  const nativeArch = detectNativeNodeArch(nativeBinary);
  const candidates = resolveNodeBinaryCandidates();

  if (!nativeArch) {
    console.log(
      "[stream-server] Could not detect native binary architecture, using default node.",
    );
    return candidates[0] || "node";
  }

  // 1. Try to find an external node binary that matches the native architecture
  console.log(
    `[stream-server] Searching for node binary matching ${nativeArch} among ${candidates.length} candidates...`,
  );
  for (const candidate of candidates) {
    const nodeArch = getNodeArch(candidate);
    if (nodeArch === nativeArch) {
      console.log(
        `[stream-server] Selected matched runtime: ${candidate} (${nodeArch})`,
      );
      return candidate;
    }
  }

  // 2. Fallback: Check if Electron's own architecture matches.
  // If so, we should probably run in-process or try to find where this electron is.
  if (process.arch === nativeArch) {
    console.log(
      `[stream-server] No external ${nativeArch} node found, but Electron is ${process.arch}. Forcing bridge to run in-process.`,
    );
    process.env.STREAMER_BRIDGE_IN_PROCESS = "1";
    return process.execPath;
  }

  const checked = candidates
    .slice(0, 15) // Limit output
    .map(
      (candidate) =>
        `${path.basename(candidate)} (${getNodeArch(candidate) || "unavailable"})`,
    )
    .join(", ");

  const repairHint =
    process.platform === "darwin" && nativeArch === "arm64"
      ? "Tip: You are on Apple Silicon. Install the 'arm64' version of Node.js (e.g., via 'brew install node' or official installer) and restart the app."
      : "Tip: Reinstall dependencies under your current architecture or set STREAMER_BRIDGE_NODE to a matching Node binary.";

  throw new Error(
    `No Node.js runtime matches node-datachannel architecture "${nativeArch}". Checked: ${checked}. ${repairHint}`,
  );
}

async function startBridgeDaemon() {
  const startSequence = ++bridgeStartSequence;
  const pairingToken = getBridgePairingToken();
  const runtimeDiagnostics = getBridgeRuntimeDiagnostics();

  writeBridgeOwnerClaim("starting");
  killBridgePortProcesses();
  await new Promise((resolve) => setTimeout(resolve, 250));

  setBridgeState({
    status: "starting",
    error: null,
    reason: null,
    startedAt: null,
    nodeExecutable: null,
    nodeArch: null,
    nativeBinary: runtimeDiagnostics.nativeBinary,
    nativeArch: runtimeDiagnostics.nativeArch,
    entrypoint: null,
    pid: null,
  });

  const entrypoint = resolveBridgeEntrypoint();
  const nodeExecutable = resolveNodeExecutable();
  if (process.env.STREAMER_BRIDGE_IN_PROCESS === "1") {
    process.env.STREAMER_BRIDGE_TOKEN = pairingToken;
    process.env.STREAMER_BRIDGE_OWNER = "desktop";
    process.env.STREAMER_BRIDGE_CLAIM_FILE = getBridgeOwnerClaimPath();
    process.env.STREAMER_APP_VERSION = desktopBuildMetadata.appVersion;
    process.env.STREAMER_GIT_SHA = desktopBuildMetadata.gitSha;
    process.env.STREAMER_BUILD_DATE = desktopBuildMetadata.buildDate;
    process.env.STREAMER_BUILD_CHANNEL = desktopBuildMetadata.buildChannel;
    process.env.STREAMER_BUILD_ENVIRONMENT = desktopBuildMetadata.environment;
    const streamServer = await import("@streamer/stream-server");
    const server = streamServer.startStreamServer(11470);
    setBridgeState({
      status: "running",
      startedAt: Date.now(),
      nodeExecutable: process.execPath,
      nodeArch: process.arch,
      entrypoint: "in-process",
      pid: process.pid,
    });
    writeBridgeOwnerClaim("running");
    return server;
  }

  if (!fs.existsSync(entrypoint)) {
    throw new Error(
      `Stream server entrypoint not found: ${entrypoint}. Run npm run build --workspace=@streamer/stream-server first.`,
    );
  }

  const nodeArch = getNodeArch(nodeExecutable);
  const child = spawn(nodeExecutable, [entrypoint], {
    cwd: resolveBridgeWorkingDirectoryPath({
      dirname: __dirname,
      entrypoint,
      resourcesPath: process.resourcesPath,
    }),
    env: {
      ...process.env,
      PORT: "11470",
      STREAMER_BRIDGE_TOKEN: pairingToken,
      STREAMER_BRIDGE_OWNER: "desktop",
      STREAMER_BRIDGE_CLAIM_FILE: getBridgeOwnerClaimPath(),
      STREAMER_APP_VERSION: desktopBuildMetadata.appVersion,
      STREAMER_GIT_SHA: desktopBuildMetadata.gitSha,
      STREAMER_BUILD_DATE: desktopBuildMetadata.buildDate,
      STREAMER_BUILD_CHANNEL: desktopBuildMetadata.buildChannel,
      STREAMER_BUILD_ENVIRONMENT: desktopBuildMetadata.environment,
      STREAMER_BRIDGE_RUNTIME_ARCH: nodeArch || "",
      STREAMER_BRIDGE_NATIVE_ARCH: runtimeDiagnostics.nativeArch || "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[stream-server] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[stream-server] ${chunk}`);
  });
  child.on("error", (error) => {
    captureDesktopException(error, {
      component: "stream-server",
      action: "spawn",
      nodeExecutable,
      entrypoint,
      nativeArch: runtimeDiagnostics.nativeArch,
    });
    console.error(
      "[stream-server] Failed to start bridge child process:",
      redactSensitiveText(error?.message || error),
    );
    if (startSequence !== bridgeStartSequence) return;
    setBridgeState({
      status: "error",
      error: error?.message || String(error),
      reason: classifyBridgeError(error),
      pid: null,
    });
    bridgeServer = null;
  });
  child.on("exit", (code, signal) => {
    if (startSequence !== bridgeStartSequence) return;
    if (code !== 0 && signal !== "SIGTERM") {
      captureDesktopMessage("Bridge child process exited unexpectedly", {
        component: "stream-server",
        action: "exit",
        code,
        signal,
        nodeExecutable,
        entrypoint,
        nativeArch: runtimeDiagnostics.nativeArch,
      });
      console.warn(
        `[stream-server] Bridge child process exited with code ${code ?? "null"} signal ${signal ?? "null"}`,
      );
      setBridgeState({
        status: "error",
        error: `Bridge process exited with code ${code ?? "null"} signal ${signal ?? "null"}`,
        reason: "bridge-process-exited",
        pid: null,
      });
    } else {
      setBridgeState({
        status: "stopped",
        pid: null,
      });
    }
    bridgeServer = null;
  });

  setBridgeState({
    status: "running",
    startedAt: Date.now(),
    error: null,
    reason: null,
    nodeExecutable,
    nodeArch,
    nativeBinary: runtimeDiagnostics.nativeBinary,
    nativeArch: runtimeDiagnostics.nativeArch,
    entrypoint,
    pid: child.pid || null,
  });
  writeBridgeOwnerClaim("running");

  return {
    close: () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    },
    process: child,
  };
}

function readBridgeHealth() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:11470/api/health", (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

async function getBridgeInfoSnapshot() {
  const rawHealth = bridgeServer ? await readBridgeHealth() : null;
  const healthOwner = getBridgeHealthOwner(rawHealth);
  const hasForeignBridgeOwner =
    !!rawHealth && !!healthOwner && healthOwner !== "desktop";
  const health = hasForeignBridgeOwner ? null : rawHealth;
  const torrentEngine = health?.torrentEngine || null;
  const runtimeDiagnostics = getBridgeRuntimeDiagnostics();
  const status = bridgeServer
    ? hasForeignBridgeOwner
      ? "starting"
      : !health
        ? "starting"
        : torrentEngine?.available === false
          ? "error"
          : "running"
    : bridgeState.status;

  return {
    available: !!bridgeServer && !!health && torrentEngine?.available !== false,
    localUrl: "http://localhost:11470",
    lanUrl: bridgeLanUrl,
    pairingToken: getBridgePairingToken(),
    build: desktopBuildMetadata,
    desktopRuntime,
    diagnostics: {
      ...bridgeState,
      status,
      reason: hasForeignBridgeOwner
        ? "bridge-port-owned-by-other-process"
        : torrentEngine?.reason || bridgeState.reason || undefined,
      message: hasForeignBridgeOwner
        ? `Waiting for the desktop bridge to reclaim port 11470 from ${healthOwner}.`
        : torrentEngine?.message || bridgeState.error || undefined,
      processArch: torrentEngine?.processArch || process.arch,
      platform: torrentEngine?.platform || process.platform,
      nativeBinary: bridgeState.nativeBinary || runtimeDiagnostics.nativeBinary,
      nativeArch: bridgeState.nativeArch || runtimeDiagnostics.nativeArch,
      build: desktopBuildMetadata,
      health: health || rawHealth,
    },
  };
}

async function restartBridgeDaemon() {
  if (disableBridgeForDesktopSmoke) {
    bridgeServer = null;
    setBridgeState({
      status: "stopped",
      startedAt: null,
      error: null,
      reason: "desktop-smoke-bridge-disabled",
      pid: null,
    });
    return getBridgeInfoSnapshot();
  }

  try {
    bridgeServer?.close?.();
  } catch {}
  bridgeServer = null;
  setBridgeState({
    status: "starting",
    error: null,
    reason: null,
    pid: null,
  });

  try {
    bridgeServer = await startBridgeDaemon();
    bridgeLanUrl = resolveLanBridgeUrl();
  } catch (error) {
    setBridgeState({
      status: "error",
      error: error?.message || String(error),
      reason: classifyBridgeError(error),
      pid: null,
    });
    bridgeServer = null;
  }

  return getBridgeInfoSnapshot();
}

function createWindow() {
  mainWindow = new electron_1.BrowserWindow({
    width: 1280,
    height: 720,
    title: "Streamer",
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  // Load the expo web app (assumes it is running on 8081 for dev)
  mainWindow.loadURL(buildRendererUrl("/"));

  mainWindow.on("close", (event) => {
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
      { label: "Open Streamer", click: () => mainWindow.show() },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          electron_1.app.isQuiting = true;
          electron_1.app.quit();
        },
      },
    ]);
    tray.setToolTip("Streamer");
    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => mainWindow.show());
  } catch (e) {
    captureDesktopException(e, { component: "system-tray" });
    console.warn(
      "Failed to create system tray:",
      redactSensitiveText(e?.message || e),
    );
  }
}

electron_1.app.whenReady().then(async () => {
  configureElectronSecurity();

  // Register custom protocol to bypass security sandbox for local downloaded files
  electron_1.protocol.registerFileProtocol("streamer", (request, callback) => {
    const filePath = resolveManagedDownloadPath(downloadsPath, request.url);
    if (filePath) return callback(filePath);
    console.warn("[downloads] Rejected unmanaged streamer protocol path");
    return callback({ error: -6 });
  });

  // Set up IPC Handlers
  onTrusted("handoff-play", (event, data) => {
    const payload = normalizeHandoffPayload(data);
    if (mainWindow) {
      console.log(
        `[handoff] Directing UI to play${payload.title ? `: ${payload.title}` : ""}`,
      );

      const playerUrl = buildRendererUrl("/player", {
        magnet: payload.magnet,
        startTime: payload.position,
        title: payload.title,
        itemId: payload.itemId,
      });

      mainWindow.loadURL(playerUrl);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  handleTrusted("check-file", async (event, localUri) => {
    const filePath = resolveManagedDownloadPath(
      downloadsPath,
      normalizeLocalUri(localUri),
    );
    return Boolean(filePath && fs.existsSync(filePath));
  });

  handleTrusted("inspect-file", async (event, localUri) => {
    const filePath = resolveManagedDownloadPath(
      downloadsPath,
      normalizeLocalUri(localUri),
    );
    if (!filePath || !fs.existsSync(filePath)) {
      return { exists: false, isFile: false, sizeBytes: 0 };
    }
    const stats = fs.statSync(filePath);
    return {
      exists: true,
      isFile: stats.isFile(),
      sizeBytes: stats.isFile() ? Math.max(0, stats.size) : 0,
    };
  });

  handleTrusted("delete-file", async (event, localUri) => {
    const filePath = resolveManagedDownloadPath(
      downloadsPath,
      normalizeLocalUri(localUri),
    );
    if (!filePath) {
      throw new Error("Downloaded file path is not managed by Streamer");
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  handleTrusted("get-bridge-info", async () => getBridgeInfoSnapshot());

  handleTrusted("restart-bridge", async () => restartBridgeDaemon());

  handleTrusted("get-storage-info", async () => getStorageInfo());

  handleTrusted("get-update-status", async () => snapshotUpdateState());

  handleTrusted("check-for-updates", async () => checkForDesktopUpdates());

  handleTrusted("open-update-page", async () => {
    openSafeExternalUrl(RELEASES_URL);
    return snapshotUpdateState();
  });

  handleTrusted("download-media", async (event, id, url, filename) => {
    const request = normalizeDownloadIpcArgs(id, url, filename);
    return downloadMediaFile(request.id, request.url, request.filename);
  });

  handleTrusted("download-job-start", async (event, id, url, filename) => {
    const request = normalizeDownloadIpcArgs(id, url, filename);
    return startDownloadJob(request.id, request.url, request.filename);
  });

  handleTrusted("download-job-get", async (event, id) => {
    const job = downloadJobs.get(normalizeIpcId(id));
    return job ? snapshotDownloadJob(job) : null;
  });

  handleTrusted("download-job-pause", async (event, id) => {
    return pauseDownloadJob(normalizeIpcId(id));
  });

  handleTrusted("download-job-resume", async (event, id) => {
    return resumeDownloadJob(normalizeIpcId(id));
  });

  handleTrusted("download-job-cancel", async (event, id) => {
    return cancelDownloadJob(normalizeIpcId(id));
  });

  if (disableBridgeForDesktopSmoke) {
    setBridgeState({
      status: "stopped",
      startedAt: null,
      error: null,
      reason: "desktop-smoke-bridge-disabled",
      pid: null,
    });
    console.log(
      "[desktop-smoke] Bridge daemon and Bonjour discovery are disabled.",
    );
  } else {
    // Start the background P2P stream server outside Electron main so native
    // Node add-ons load against the same Node architecture used by npm install.
    try {
      bridgeServer = await startBridgeDaemon();
      bridgeLanUrl = resolveLanBridgeUrl();
      console.log(
        `Successfully started @streamer/stream-server background daemon at ${bridgeLanUrl}`,
      );
      electron_1.app.on("will-quit", () => {
        bridgeServer?.close?.();
        clearBridgeOwnerClaim();
      });

      // Announce this desktop bridge on the local network via Bonjour
      try {
        const { Bonjour } = await import("bonjour-service");
        const bonjour = new Bonjour();
        const service = bonjour.publish({
          name: `Streamer Desktop (${require("os").hostname()})`,
          type: "streamer-bridge",
          protocol: "tcp",
          port: 11470,
          txt: {
            version: desktopBuildMetadata.appVersion,
            id: electron_1.app.getPath("userData"),
          },
        });
        console.log(`[discovery] Announcing desktop bridge: ${service.name}`);

        electron_1.app.on("will-quit", () => {
          bonjour.unpublishAll(() => {
            bonjour.destroy();
          });
        });
      } catch (discoveryError) {
        captureDesktopException(discoveryError, { component: "bonjour" });
        console.warn(
          "[discovery] Failed to announce via Bonjour:",
          redactSensitiveText(discoveryError?.message || discoveryError),
        );
      }
    } catch (error) {
      captureDesktopException(error, {
        component: "stream-server",
        action: "start-daemon",
      });
      console.error(
        "Failed to start stream server daemon:",
        redactSensitiveText(error?.message || error),
      );
      clearBridgeOwnerClaim();
      setBridgeState({
        status: "error",
        error: error?.message || String(error),
        reason: classifyBridgeError(error),
        pid: null,
      });
    }
  }
  createWindow();
  createTray();
  configureUpdateChecks();

  electron_1.app.on("activate", function () {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

electron_1.app.on("window-all-closed", function () {
  if (process.platform !== "darwin") electron_1.app.quit();
});
