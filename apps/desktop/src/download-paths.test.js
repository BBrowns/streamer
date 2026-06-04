"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  resolveManagedDownloadPath,
  toStreamerUri,
} = require("./download-paths");

const downloadsPath = path.join(path.sep, "Users", "streamer", "offline_media");

test("resolves final media files inside the managed download directory", () => {
  const mediaPath = path.join(downloadsPath, "movie with spaces.mp4");
  const localUri = toStreamerUri(mediaPath);

  assert.equal(resolveManagedDownloadPath(downloadsPath, localUri), mediaPath);
});

test("rejects paths outside the managed download directory", () => {
  const localUri = toStreamerUri(
    path.join(downloadsPath, "..", "sensitive-file.txt"),
  );

  assert.equal(resolveManagedDownloadPath(downloadsPath, localUri), null);
});

test("rejects internal manifest and partial files", () => {
  assert.equal(
    resolveManagedDownloadPath(
      downloadsPath,
      toStreamerUri(path.join(downloadsPath, "download-jobs.json")),
    ),
    null,
  );
  assert.equal(
    resolveManagedDownloadPath(
      downloadsPath,
      toStreamerUri(path.join(downloadsPath, "movie.mp4.part")),
    ),
    null,
  );
});

test("rejects malformed and decorated local URIs", () => {
  assert.equal(resolveManagedDownloadPath(downloadsPath, "streamer://%"), null);
  assert.equal(
    resolveManagedDownloadPath(
      downloadsPath,
      `${toStreamerUri(path.join(downloadsPath, "movie.mp4"))}?token=secret`,
    ),
    null,
  );
});
