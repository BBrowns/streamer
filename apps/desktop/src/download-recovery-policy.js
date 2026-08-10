"use strict";

const MAX_ACTIVE_DOWNLOADS = 2;
const DEFAULT_STORAGE_HEADROOM_BYTES = 64 * 1024 * 1024;

function clampBytes(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function getDownloadRemainingBytes(expectedBytes, downloadedBytes) {
  return Math.max(0, clampBytes(expectedBytes) - clampBytes(downloadedBytes));
}

/**
 * Reserve the remaining known bytes plus a small safety margin. Unknown-size
 * responses reserve only the safety margin until HTTP headers establish a
 * trusted total.
 */
function getDownloadReservationBytes({
  expectedBytes,
  downloadedBytes,
  headroomBytes = DEFAULT_STORAGE_HEADROOM_BYTES,
} = {}) {
  const headroom = clampBytes(headroomBytes) || DEFAULT_STORAGE_HEADROOM_BYTES;
  return getDownloadRemainingBytes(expectedBytes, downloadedBytes) + headroom;
}

function getStoragePreflight({
  freeBytes,
  reservedBytes = 0,
  expectedBytes,
  downloadedBytes,
  headroomBytes = DEFAULT_STORAGE_HEADROOM_BYTES,
  storageKnown = true,
} = {}) {
  const free = clampBytes(freeBytes);
  const reserved = clampBytes(reservedBytes);
  const availableBytes = Math.max(0, free - reserved);
  const requiredBytes = getDownloadReservationBytes({
    expectedBytes,
    downloadedBytes,
    headroomBytes,
  });

  // A failed statfs call is not proof that the disk is full. The write path
  // still handles ENOSPC/EACCES, but diagnostics must not block every start.
  if (storageKnown === false) {
    return {
      ok: true,
      reason: null,
      freeBytes: free,
      reservedBytes: reserved,
      availableBytes,
      requiredBytes,
    };
  }

  return {
    ok: availableBytes >= requiredBytes,
    reason: availableBytes >= requiredBytes ? null : "storage_pressure",
    freeBytes: free,
    reservedBytes: reserved,
    availableBytes,
    requiredBytes,
  };
}

function evaluateDownloadStart({
  activeCount = 0,
  maxActiveDownloads = MAX_ACTIVE_DOWNLOADS,
  ...storageInput
} = {}) {
  const active = Math.max(0, Number(activeCount) || 0);
  const maximum = Math.max(1, Number(maxActiveDownloads) || 1);
  if (active >= maximum) {
    return {
      ok: false,
      reason: "concurrency_limit",
      activeCount: active,
      maxActiveDownloads: maximum,
    };
  }

  return {
    ...getStoragePreflight(storageInput),
    activeCount: active,
    maxActiveDownloads: maximum,
  };
}

/**
 * Small, side-effect-free scheduler used by the Electron main process. The
 * callbacks keep policy decisions testable without importing Electron.
 */
class DownloadScheduler {
  constructor({
    maxActiveDownloads = MAX_ACTIVE_DOWNLOADS,
    preflight,
    start,
    onRejected,
  } = {}) {
    this.maxActiveDownloads = Math.max(1, Number(maxActiveDownloads) || 1);
    this.preflight =
      typeof preflight === "function" ? preflight : () => ({ ok: true });
    this.start = typeof start === "function" ? start : () => undefined;
    this.onRejected =
      typeof onRejected === "function" ? onRejected : () => undefined;
    this.queue = [];
    this.active = new Map();
    this.draining = false;
  }

  enqueue(job, resumeAt = 0) {
    if (!job || !job.id || this.active.has(job.id)) return;
    this.queue = this.queue.filter((entry) => entry.job.id !== job.id);
    this.queue.push({ job, resumeAt: Math.max(0, Number(resumeAt) || 0) });
    this.drain();
  }

  remove(id) {
    this.queue = this.queue.filter((entry) => entry.job.id !== id);
  }

  release(id) {
    this.active.delete(id);
    this.drain();
  }

  isActive(id) {
    return this.active.has(id);
  }

  getActiveJobs() {
    return Array.from(this.active.values());
  }

  get activeCount() {
    return this.active.size;
  }

  drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.active.size < this.maxActiveDownloads && this.queue.length) {
        const entry = this.queue.shift();
        if (!entry || !entry.job || entry.job.cancelRequested) continue;

        const decision = this.preflight(entry.job, this.getActiveJobs());
        if (!decision?.ok) {
          this.onRejected(
            entry.job,
            decision || { reason: "storage_pressure" },
          );
          continue;
        }

        this.active.set(entry.job.id, entry.job);
        try {
          this.start(entry.job, entry.resumeAt);
        } catch (error) {
          this.active.delete(entry.job.id);
          this.onRejected(entry.job, {
            ok: false,
            reason: "start_failed",
            error,
          });
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

module.exports = {
  DEFAULT_STORAGE_HEADROOM_BYTES,
  DownloadScheduler,
  MAX_ACTIVE_DOWNLOADS,
  evaluateDownloadStart,
  getDownloadRemainingBytes,
  getDownloadReservationBytes,
  getStoragePreflight,
};
