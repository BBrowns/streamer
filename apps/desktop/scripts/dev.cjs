"use strict";

const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DESKTOP_ROOT = path.resolve(__dirname, "..");
const DEFAULT_RENDERER_URL = "http://localhost:8081/";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_MS = 250;

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

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
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
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      resolve(signal ? 128 : (code ?? 1));
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
  getRendererUrl,
  probePort,
  probeRenderer,
  waitForRenderer,
};
