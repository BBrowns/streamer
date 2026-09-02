"use strict";

const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { stopOwnedBridge } = require("../apps/desktop/scripts/dev.cjs");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const SERVICE_TIMEOUT_MS = 120_000;
const SERVICE_RETRY_MS = 250;

function spawnNpmScript(script) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawn(npmCommand, ["run", script], {
    cwd: REPOSITORY_ROOT,
    env: process.env,
    detached: process.platform !== "win32",
    stdio: "inherit",
  });
}

function isChildRunning(child) {
  if (!child) return false;

  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  }

  return child.exitCode === null && child.signalCode === null;
}

function signalChild(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
    } else if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitForChildren(children, timeoutMs, options = {}) {
  const childIsRunning = options.isChildRunning || isChildRunning;
  const now = options.now || (() => Date.now());
  const sleep =
    options.sleep ||
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + timeoutMs;

  while (now() <= deadline) {
    if (!children.some(childIsRunning)) return true;
    await sleep(Math.min(50, Math.max(0, deadline - now())));
  }

  return !children.some(childIsRunning);
}

async function terminateChildren(children, options = {}) {
  const childIsRunning = options.isChildRunning || isChildRunning;
  const sendSignal = options.signalChild || signalChild;
  const wait = options.waitForChildren || waitForChildren;
  const gracefulTimeoutMs = options.gracefulTimeoutMs ?? 5_000;
  const forceTimeoutMs = options.forceTimeoutMs ?? 2_000;
  const waitOptions = { isChildRunning: childIsRunning };
  const targets = children.filter(childIsRunning).reverse();

  if (targets.length === 0) return true;
  targets.forEach((child) => sendSignal(child, "SIGTERM"));
  if (await wait(targets, gracefulTimeoutMs, waitOptions)) return true;

  const survivors = targets.filter(childIsRunning);
  survivors.forEach((child) => sendSignal(child, "SIGKILL"));
  return wait(survivors, forceTimeoutMs, waitOptions);
}

function probeHttp(url) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const request = client.get(target, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });
    request.setTimeout(1_000, () => {
      request.destroy();
      resolve(false);
    });
    request.once("error", () => resolve(false));
  });
}

async function waitForService(name, url, options = {}) {
  const timeoutMs = options.timeoutMs ?? SERVICE_TIMEOUT_MS;
  const retryMs = options.retryMs ?? SERVICE_RETRY_MS;
  const now = options.now || (() => Date.now());
  const sleep =
    options.sleep ||
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const probe = options.probe || probeHttp;
  const deadline = now() + timeoutMs;

  while (now() <= deadline) {
    if (await probe(url)) return true;
    await sleep(Math.min(retryMs, Math.max(0, deadline - now())));
  }

  throw new Error(
    `${name} did not become ready at ${url} within ${timeoutMs}ms.`,
  );
}

function watchChild(child, script) {
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ kind: "error", error, script }));
    child.once("exit", (code, signal) =>
      resolve({ kind: "exit", code, signal, script }),
    );
  });
}

function exitCodeForOutcome(outcome) {
  if (outcome.kind === "signal") {
    return outcome.signal === "SIGINT" ? 130 : 143;
  }
  if (outcome.kind === "error") throw outcome.error;
  return outcome.signal ? 128 : (outcome.code ?? 1);
}

async function run(options = {}) {
  const signalSource = options.signalSource || process;
  const spawnScript = options.spawnScript || spawnNpmScript;
  const waitUntilReady = options.waitForService || waitForService;
  const terminate = options.terminateChildren || terminateChildren;
  const cleanupBridge = options.stopOwnedBridge || stopOwnedBridge;
  const children = [];
  const childOutcomes = [];
  let desktopWasStarted = false;
  let resolveSignal;
  const signalOutcome = new Promise((resolve) => {
    resolveSignal = resolve;
  });
  const onSigint = () => resolveSignal({ kind: "signal", signal: "SIGINT" });
  const onSigterm = () => resolveSignal({ kind: "signal", signal: "SIGTERM" });

  signalSource.once("SIGINT", onSigint);
  signalSource.once("SIGTERM", onSigterm);

  try {
    const server = spawnScript("dev:server");
    const web = spawnScript("dev:mobile:web");
    children.push(server, web);
    childOutcomes.push(
      watchChild(server, "dev:server"),
      watchChild(web, "dev:mobile:web"),
    );

    const startupOutcome = await Promise.race([
      Promise.all([
        waitUntilReady("API server", "http://127.0.0.1:3001/health"),
        waitUntilReady("Expo web renderer", "http://127.0.0.1:8081/"),
      ]).then(() => ({ kind: "ready" })),
      signalOutcome,
      ...childOutcomes,
    ]);
    if (startupOutcome.kind !== "ready") {
      return exitCodeForOutcome(startupOutcome);
    }

    const desktop = spawnScript("dev:desktop");
    desktopWasStarted = true;
    children.push(desktop);
    childOutcomes.push(watchChild(desktop, "dev:desktop"));

    return exitCodeForOutcome(
      await Promise.race([signalOutcome, ...childOutcomes]),
    );
  } finally {
    signalSource.removeListener("SIGINT", onSigint);
    signalSource.removeListener("SIGTERM", onSigterm);
    const stopped = await terminate(children);
    if (desktopWasStarted) {
      await cleanupBridge();
    }
    if (!stopped) {
      console.error("[desktop-all] Some child processes did not stop cleanly.");
    }
  }
}

if (require.main === module) {
  run()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[desktop-all] ${error.message || error}`);
      process.exitCode = 1;
    });
}

module.exports = {
  run,
  terminateChildren,
  waitForService,
};
