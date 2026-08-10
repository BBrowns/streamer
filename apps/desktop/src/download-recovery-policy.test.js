"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_STORAGE_HEADROOM_BYTES,
  DownloadScheduler,
  MAX_ACTIVE_DOWNLOADS,
  evaluateDownloadStart,
  getDownloadReservationBytes,
  getStoragePreflight,
} = require("./download-recovery-policy");

test("reserves remaining known bytes plus headroom", () => {
  assert.equal(
    getDownloadReservationBytes({
      expectedBytes: 1000,
      downloadedBytes: 400,
      headroomBytes: 100,
    }),
    700,
  );
  assert.equal(
    getDownloadReservationBytes({ expectedBytes: 0, downloadedBytes: 400 }),
    DEFAULT_STORAGE_HEADROOM_BYTES,
  );
});

test("storage preflight accounts for active reservations", () => {
  const decision = getStoragePreflight({
    freeBytes: 1000,
    reservedBytes: 300,
    expectedBytes: 600,
    downloadedBytes: 0,
    headroomBytes: 100,
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.availableBytes, 700);
  assert.equal(decision.requiredBytes, 700);

  assert.equal(
    getStoragePreflight({
      freeBytes: 999,
      reservedBytes: 300,
      expectedBytes: 600,
      headroomBytes: 100,
    }).reason,
    "storage_pressure",
  );
});

test("missing storage diagnostics fail open while preserving the write guard", () => {
  assert.equal(
    getStoragePreflight({
      freeBytes: 0,
      expectedBytes: 1000,
      storageKnown: false,
    }).ok,
    true,
  );
});

test("download starts are bounded and queued jobs drain on release", () => {
  const started = [];
  const scheduler = new DownloadScheduler({
    maxActiveDownloads: MAX_ACTIVE_DOWNLOADS,
    preflight: () => evaluateDownloadStart({ storageKnown: false }),
    start: (job) => started.push(job.id),
  });
  const jobs = ["a", "b", "c"].map((id) => ({ id }));

  jobs.forEach((job) => scheduler.enqueue(job));
  assert.deepEqual(started, ["a", "b"]);
  assert.equal(scheduler.activeCount, 2);

  scheduler.release("a");
  assert.deepEqual(started, ["a", "b", "c"]);
  assert.equal(scheduler.activeCount, 2);
});

test("storage rejection does not consume a concurrency slot", () => {
  const rejected = [];
  const started = [];
  const scheduler = new DownloadScheduler({
    preflight: (job) =>
      job.id === "full"
        ? { ok: false, reason: "storage_pressure" }
        : { ok: true },
    start: (job) => started.push(job.id),
    onRejected: (job, decision) => rejected.push([job.id, decision.reason]),
  });

  scheduler.enqueue({ id: "full" });
  scheduler.enqueue({ id: "ok" });

  assert.deepEqual(rejected, [["full", "storage_pressure"]]);
  assert.deepEqual(started, ["ok"]);
  assert.equal(scheduler.activeCount, 1);
});
