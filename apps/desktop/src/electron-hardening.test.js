"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mainSource = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
const preloadSource = fs.readFileSync(
  path.join(__dirname, "preload.js"),
  "utf8",
);

test("BrowserWindow opts into hardened renderer preferences", () => {
  for (const requiredSnippet of [
    "nodeIntegration: false",
    "nodeIntegrationInWorker: false",
    "nodeIntegrationInSubFrames: false",
    "contextIsolation: true",
    "sandbox: true",
    "webSecurity: true",
    "allowRunningInsecureContent: false",
    "experimentalFeatures: false",
    "webviewTag: false",
  ]) {
    assert.match(
      mainSource,
      new RegExp(requiredSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("main process registers security hooks for renderer boundaries", () => {
  for (const requiredSnippet of [
    "setPermissionRequestHandler",
    "setPermissionCheckHandler",
    "onHeadersReceived",
    "will-attach-webview",
    "will-navigate",
    "will-redirect",
    "setWindowOpenHandler",
    "isTrustedRendererUrl",
  ]) {
    assert.match(mainSource, new RegExp(requiredSnippet));
  }
});

test("IPC channels are registered through trusted wrappers", () => {
  assert.doesNotMatch(
    mainSource,
    /electron_1\.ipcMain\.(?:handle|on)\(\s*["']/,
  );

  for (const channel of [
    "get-bridge-info",
    "restart-bridge",
    "download-job-start",
    "download-job-cancel",
    "handoff-play",
  ]) {
    assert.match(
      mainSource,
      new RegExp(`(?:handleTrusted|onTrusted)\\("${channel}"`),
    );
  }
});

test("shell.openExternal remains behind the external URL allowlist", () => {
  assert.match(mainSource, /function openSafeExternalUrl/);
  assert.match(mainSource, /isAllowedExternalUrl\(url\)/);
  assert.match(mainSource, /electron_1\.shell\.openExternal\(url\)/);
  assert.doesNotMatch(mainSource, /shell\.openExternal\([^u]/);
});

test("preload exposes a narrow API without raw ipcRenderer access", () => {
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preloadSource, /ipcRenderer\.send\(/);
  assert.doesNotMatch(preloadSource, /ipcRenderer\.sendSync\(/);
  assert.doesNotMatch(preloadSource, /ipcRenderer\.on\([^,]+,\s*callback\)/);
  assert.match(
    preloadSource,
    /const handler = \(_event, data\) => callback\(data\)/,
  );
});
