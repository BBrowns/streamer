"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DOWNLOAD_JOBS_FILE_VERSION,
  classifyDownloadFailure,
  normalizePersistedDownloadJob,
  serializeDownloadJobsV2,
} = require("./download-job-persistence");

test("persists URL-free version 2 download metadata", () => {
  const payload = serializeDownloadJobsV2([
    {
      id: "download-1",
      status: "Downloading",
      downloadUrl: "https://signed.example.test/movie.mp4?token=secret",
      filename: "movie.mp4",
      filePath: "/Users/example/offline_media/movie.mp4",
      tempPath: "/Users/example/offline_media/movie.mp4.part",
      localUri: "streamer:///Users/example/offline_media/movie.mp4",
      error: "Request failed for https://signed.example.test/movie.mp4",
      totalBytesWritten: 512,
      totalBytesExpectedToWrite: 1024,
      contentType: "video/mp4",
      metadataBytes: 20,
    },
  ]);

  assert.equal(payload.version, DOWNLOAD_JOBS_FILE_VERSION);
  assert.deepEqual(payload.jobs, [
    {
      id: "download-1",
      status: "Paused",
      filename: "movie.mp4",
      totalBytesWritten: 512,
      totalBytesExpectedToWrite: 1024,
      contentType: "video/mp4",
      metadataBytes: 20,
      requiresReplan: true,
    },
  ]);
  const serialized = JSON.stringify(payload);
  for (const secret of [
    "https://",
    "token=secret",
    "downloadUrl",
    "filePath",
    "tempPath",
    "localUri",
    "Request failed",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("migrates legacy interrupted jobs without reusing their URL or error", () => {
  const restored = normalizePersistedDownloadJob(
    {
      id: "download-1",
      status: "Downloading",
      downloadUrl: "https://signed.example.test/movie.mp4?token=secret",
      filename: "movie.mp4",
      localUri: "streamer:///Users/example/offline_media/movie.mp4",
      error: "Request failed for https://signed.example.test/movie.mp4",
      totalBytesWritten: 400,
      totalBytesExpectedToWrite: 1000,
    },
    { partialFileBytes: 450 },
  );

  assert.deepEqual(restored, {
    id: "download-1",
    status: "Paused",
    filename: "movie.mp4",
    totalBytesWritten: 450,
    totalBytesExpectedToWrite: 1000,
    contentType: null,
    metadataBytes: 0,
    failureReason: "interrupted",
    requiresReplan: true,
  });
});

test("rederives completed state from the managed file instead of persisted URI", () => {
  const restored = normalizePersistedDownloadJob(
    {
      id: "download-1",
      status: "Completed",
      filename: "movie.mp4",
      localUri: "streamer:///untrusted/location/movie.mp4",
      totalBytesWritten: 900,
      totalBytesExpectedToWrite: 1000,
    },
    { completedFileExists: true, completedFileBytes: 1000 },
  );

  assert.equal(restored?.status, "Completed");
  assert.equal(restored?.totalBytesWritten, 1000);
  assert.equal(restored?.requiresReplan, false);
  assert.equal("localUri" in restored, false);
});

test("classifies source-access failures without retaining raw messages", () => {
  assert.equal(
    classifyDownloadFailure(
      new Error("403 for https://signed.example.test/movie.mp4?token=secret"),
    ),
    "source_access_expired",
  );
});

test("drops legacy jobs whose id itself contains source material", () => {
  const payload = serializeDownloadJobsV2([
    {
      id: "https://signed.example.test/movie.mp4?token=secret",
      status: "Paused",
      filename: "movie.mp4",
    },
  ]);

  assert.deepEqual(payload.jobs, []);
  assert.equal(JSON.stringify(payload).includes("https://"), false);
});
