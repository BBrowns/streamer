"use strict";

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DESKTOP_ROOT = path.resolve(__dirname, "..");
const DEFAULT_RENDERER_URL = "http://localhost:8081/";
const BRIDGE_HEALTH_URL = "http://127.0.0.1:11470/api/health";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_MS = 250;
const BRIDGE_CLEANUP_TIMEOUT_MS = 2_000;

function getRendererUrl(env = process.env) {
  return env.STREAMER_DESKTOP_RENDERER_URL || DEFAULT_RENDERER_URL;
}

function getHttpClient(url) {
  return url.protocol === "https:" ? https : http;
}

function probeRenderer(url, options = {}) {
  const request = options.request || getHttpClient(new URL(url)).get;
  const target = new URL(url);

  return new Promise((resolve) => {
    const req = request(target, (response) => {
      const contentType = String(response.headers?.["content-type"] || "");
      response.resume?.();
      resolve(
        response.statusCode >= 200 &&
          response.statusCode < 400 &&
          /text\/html/i.test(contentType),
      );
    });
    req.setTimeout?.(1_000, () => {
      req.destroy?.();
      resolve(false);
    });
    req.once?.("error", () => resolve(false));
  });
}

function probePort(port, options = {}) {
  const connect = options.connect || net.createConnection;
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy?.();
      resolve(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout?.(500, () => finish(false));
  });
}

function readBridgeHealth(options = {}) {
  const request =
    options.request || ((url, callback) => http.get(url, callback));

  return new Promise((resolve) => {
    let settled = false;
    let body = "";
    const finish = (health) => {
      if (settled) return;
      settled = true;
      resolve(health);
    };
    const req = request(BRIDGE_HEALTH_URL, (response) => {
      response.setEncoding?.("utf8");
      response.on?.("data", (chunk) => {
        if (body.length < 16 * 1024) body += String(chunk);
      });
      response.on?.("end", () => {
        try {
          finish(JSON.parse(body));
        } catch {
          finish(null);
        }
      });
      response.on?.("error", () => finish(null));
    });
    req.setTimeout?.(500, () => {
      req.destroy?.();
      finish(null);
    });
    req.once?.("error", () => finish(null));
  });
}

function getOwnedBridgePid(health) {
  if (health?.runtime?.owner !== "desktop") return null;
  const pid = Number(health.runtime.pid);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid, options = {}) {
  const check = options.kill || process.kill;
  try {
    check(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitForProcessExit(pid, options = {}) {
  const isAlive = options.isAlive || ((value) => isProcessAlive(value));
  const sleep =
    options.sleep ||
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutMs = options.timeoutMs ?? BRIDGE_CLEANUP_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (isAlive(pid) && Date.now() < deadline) {
    await sleep(Math.min(50, Math.max(0, deadline - Date.now())));
  }
  return !isAlive(pid);
}

async function stopOwnedBridge(options = {}) {
  const health = options.health || (await readBridgeHealth(options));
  const pid = options.pid || getOwnedBridgePid(health);
  const selfPid = options.selfPid || process.pid;
  if (!pid || pid === selfPid) return false;

  const sendSignal =
    options.kill || ((value, signal) => process.kill(value, signal));
  const isAlive = options.isAlive || ((value) => isProcessAlive(value));
  try {
    sendSignal(pid, "SIGTERM");
  } catch (error) {
    if (error?.code === "ESRCH") return true;
    return false;
  }

  if (
    await waitForProcessExit(pid, {
      isAlive,
      sleep: options.sleep,
      timeoutMs: options.timeoutMs,
    })
  ) {
    return true;
  }

  try {
    sendSignal(pid, "SIGKILL");
  } catch (error) {
    if (error?.code === "ESRCH") return true;
    return false;
  }
  return waitForProcessExit(pid, {
    isAlive,
    sleep: options.sleep,
    timeoutMs: options.timeoutMs,
  });
}

async function waitForRenderer(options = {}) {
  const url = options.url || DEFAULT_RENDERER_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const now = options.now || (() => Date.now());
  const sleep =
    options.sleep ||
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const probe = options.probe || probeRenderer;
  const deadline = now() + timeoutMs;

  while (now() <= deadline) {
    if (await probe(url)) return true;
    await sleep(Math.min(retryMs, Math.max(0, deadline - now())));
  }

  throw new Error(
    `Desktop renderer is not reachable at ${url}. Start Expo web with \`npm run dev:mobile:web\` or use \`npm run dev:desktop-all\`.`,
  );
}

async function assertBridgePortAvailable(options = {}) {
  const port = options.port || 11470;
  const probe = options.probe || probePort;
  if (await probe(port)) {
    throw new Error(
      `Desktop bridge port ${port} is already in use. Stop the standalone stream server before starting Electron; the desktop app owns this bridge.`,
    );
  }
  return true;
}

function launchElectron(options = {}) {
  const electronBinary = options.electronBinary || require("electron");
  return spawn(electronBinary, [path.join(DESKTOP_ROOT, "dist/main.js")], {
    cwd: DESKTOP_ROOT,
    env: options.env || process.env,
    stdio: "inherit",
  });
}

async function run() {
  await assertBridgePortAvailable();
  await waitForRenderer({ url: getRendererUrl() });
  const child = launchElectron();
  let bridgeCleanupPromise;
  const cleanupOwnedBridge = () => {
    bridgeCleanupPromise ||= stopOwnedBridge();
    return bridgeCleanupPromise;
  };

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
    void cleanupOwnedBridge();
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
    };
    child.once("error", (error) => {
      cleanup();
      void cleanupOwnedBridge().finally(() => reject(error));
    });
    child.once("exit", (code, signal) => {
      cleanup();
      void cleanupOwnedBridge().finally(() =>
        resolve(signal ? 128 : (code ?? 1)),
      );
    });
  });
}

if (require.main === module) {
  run()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[desktop] ${error.message || error}`);
      process.exitCode = 1;
    });
}

module.exports = {
  assertBridgePortAvailable,
  getOwnedBridgePid,
  getRendererUrl,
  readBridgeHealth,
  probePort,
  probeRenderer,
  stopOwnedBridge,
  waitForRenderer,
};
