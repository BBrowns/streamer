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

const { autoUpdater } = require("electron-updater");

initDesktopSentry();

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

process.on("uncaughtExceptionMonitor", (error) => {
  captureDesktopException(error, {
    component: "electron-main",
    kind: "uncaught-exception",
  });
});

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function checkUpdates() {
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on("update-available", () => {
    console.log("[updater] Update available.");
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[updater] Update downloaded; will install on quit");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-ready", info);
    }
  });

  autoUpdater.on("error", (err) => {
    captureDesktopException(err, { component: "auto-updater" });
    console.error(
      "[updater] Error in auto-updater: " + redactSensitiveText(err),
    );
  });
}

// Ensure download directory exists
const downloadsPath = path.join(
  electron_1.app.getPath("userData"),
  "offline_media",
);
if (!fs.existsSync(downloadsPath)) {
  fs.mkdirSync(downloadsPath, { recursive: true });
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
      health: health || rawHealth,
    },
  };
}

async function restartBridgeDaemon() {
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
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  // Load the expo web app (assumes it is running on 8081 for dev)
  mainWindow.loadURL("http://localhost:8081");

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
  // Register custom protocol to bypass security sandbox for local downloaded files
  electron_1.protocol.registerFileProtocol("streamer", (request, callback) => {
    const filePath = resolveManagedDownloadPath(downloadsPath, request.url);
    if (filePath) return callback(filePath);
    console.warn("[downloads] Rejected unmanaged streamer protocol path");
    return callback({ error: -6 });
  });

  // Set up IPC Handlers
  electron_1.ipcMain.on("handoff-play", (event, data) => {
    if (mainWindow) {
      console.log(
        `[handoff] Directing UI to play${data.title ? `: ${data.title}` : ""}`,
      );

      // Construct the player URL with parameters
      const playerUrl = `http://localhost:8081/player?magnet=${encodeURIComponent(data.magnet)}&startTime=${data.position || 0}&title=${encodeURIComponent(data.title || "")}&itemId=${data.itemId || ""}`;

      mainWindow.loadURL(playerUrl);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  electron_1.ipcMain.handle("check-file", async (event, localUri) => {
    const filePath = resolveManagedDownloadPath(downloadsPath, localUri);
    return Boolean(filePath && fs.existsSync(filePath));
  });

  electron_1.ipcMain.handle("delete-file", async (event, localUri) => {
    const filePath = resolveManagedDownloadPath(downloadsPath, localUri);
    if (!filePath) {
      throw new Error("Downloaded file path is not managed by Streamer");
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  electron_1.ipcMain.handle("get-bridge-info", async () =>
    getBridgeInfoSnapshot(),
  );

  electron_1.ipcMain.handle("restart-bridge", async () =>
    restartBridgeDaemon(),
  );

  electron_1.ipcMain.handle(
    "download-media",
    async (event, id, url, filename) => {
      return downloadMediaFile(id, url, filename);
    },
  );

  electron_1.ipcMain.handle(
    "download-job-start",
    async (event, id, url, filename) => {
      return startDownloadJob(id, url, filename);
    },
  );

  electron_1.ipcMain.handle("download-job-get", async (event, id) => {
    const job = downloadJobs.get(id);
    return job ? snapshotDownloadJob(job) : null;
  });

  electron_1.ipcMain.handle("download-job-pause", async (event, id) => {
    return pauseDownloadJob(id);
  });

  electron_1.ipcMain.handle("download-job-resume", async (event, id) => {
    return resumeDownloadJob(id);
  });

  electron_1.ipcMain.handle("download-job-cancel", async (event, id) => {
    return cancelDownloadJob(id);
  });

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
          version: "1.0.0",
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
  createWindow();
  createTray();
  checkUpdates();

  electron_1.app.on("activate", function () {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

electron_1.app.on("window-all-closed", function () {
  if (process.platform !== "darwin") electron_1.app.quit();
});
