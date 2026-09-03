"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const {
  createContentSecurityPolicy,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
  normalizeDownloadIpcArgs,
  normalizeDownloadJobId,
  normalizeIpcId,
  normalizeLocalUri,
} = require("./security");
const { INVOKE_IPC_CHANNELS, SUBSCRIBE_IPC_CHANNELS } = require("./security");

test("allows only explicit renderer origins", () => {
  assert.equal(
    isAllowedRendererUrl("http://localhost:8081/player", {
      allowDevServer: true,
    }),
    true,
  );
  assert.equal(
    isAllowedRendererUrl("http://localhost.evil.test:8081/player", {
      allowDevServer: true,
    }),
    false,
  );
  assert.equal(
    isAllowedRendererUrl("https://streamer.example.test/player", {
      allowDevServer: true,
    }),
    false,
  );
  assert.equal(
    isAllowedRendererUrl("http://[::1]:8081/player", {
      allowDevServer: true,
    }),
    false,
  );
});

test("allows file renderer URLs only inside configured roots", () => {
  const root = path.join(path.sep, "Applications", "Streamer", "renderer");
  const allowedUrl = pathToFileURL(path.join(root, "index.html")).toString();
  const blockedUrl = pathToFileURL(
    path.join(root, "..", "secrets.txt"),
  ).toString();

  assert.equal(
    isAllowedRendererUrl(allowedUrl, { allowedFileRoots: [root] }),
    true,
  );
  assert.equal(
    isAllowedRendererUrl(blockedUrl, { allowedFileRoots: [root] }),
    false,
  );
});

test("limits external opens to HTTPS", () => {
  assert.equal(isAllowedExternalUrl("https://example.com/help"), true);
  assert.equal(isAllowedExternalUrl("http://example.com/help"), false);
  assert.equal(isAllowedExternalUrl("file:///etc/passwd"), false);
  assert.equal(isAllowedExternalUrl("streamer://downloads/movie.mp4"), false);
});

test("creates a production CSP without unsafe eval", () => {
  const csp = createContentSecurityPolicy({ allowDevServer: false });

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /\*/);
});

test("keeps dev-only CSP looseness scoped to localhost Metro", () => {
  const csp = createContentSecurityPolicy({ allowDevServer: true });

  assert.match(csp, /'unsafe-eval'/);
  assert.match(csp, /http:\/\/localhost:8081/);
  assert.match(csp, /http:\/\/localhost:3001/);
  assert.match(csp, /ws:\/\/localhost:8081/);
  assert.doesNotMatch(csp, /\[[0-9a-f:]+\]/i);
  assert.doesNotMatch(csp, /https:\/\/\*/);
});

test("normalizes IPC download arguments and rejects local file downloads", () => {
  assert.deepEqual(
    normalizeDownloadIpcArgs("job-1", "https://cdn.example/movie.mp4", "m.mp4"),
    {
      id: "job-1",
      url: "https://cdn.example/movie.mp4",
      filename: "m.mp4",
    },
  );

  assert.throws(
    () => normalizeDownloadIpcArgs("job-1", "file:///etc/passwd", "m.mp4"),
    /HTTP or HTTPS/,
  );
});

test("validates IPC ids and local URIs", () => {
  assert.equal(normalizeIpcId(" download-1 "), "download-1");
  assert.equal(
    normalizeLocalUri(" streamer:///movie.mp4 "),
    "streamer:///movie.mp4",
  );
  assert.throws(() => normalizeIpcId(""), /id is invalid/);
  assert.throws(() => normalizeLocalUri(null), /localUri must be a string/);
});

test("requires opaque download job ids", () => {
  assert.equal(normalizeDownloadJobId("download-1"), "download-1");
  for (const sensitiveId of [
    "https://signed.example/movie.mp4?token=secret",
    "magnet:?xt=urn:btih:abc",
    "0123456789abcdef0123456789abcdef01234567",
  ]) {
    assert.throws(() => normalizeDownloadJobId(sensitiveId), /must be opaque/);
  }
});

test("allowlists update IPC channels explicitly", () => {
  assert.equal(INVOKE_IPC_CHANNELS.includes("get-update-status"), true);
  assert.equal(INVOKE_IPC_CHANNELS.includes("check-for-updates"), true);
  assert.equal(INVOKE_IPC_CHANNELS.includes("open-update-page"), true);
});

test("allowlists safe managed-file inspection while retaining check-file compatibility", () => {
  assert.equal(INVOKE_IPC_CHANNELS.includes("check-file"), true);
  assert.equal(INVOKE_IPC_CHANNELS.includes("inspect-file"), true);
});

test("allowlists only the renderer subscriptions exposed by preload", () => {
  assert.deepEqual(SUBSCRIBE_IPC_CHANNELS, [
    "download-progress",
    "update-status-changed",
  ]);
});
