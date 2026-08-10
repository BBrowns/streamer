"use strict";

const DOWNLOAD_JOBS_FILE_VERSION = 2;

const DOWNLOAD_FAILURE_REASONS = new Set([
  "source_access_expired",
  "source_unavailable",
  "invalid_source",
  "redirect_limit",
  "network_timeout",
  "local_storage_failed",
  "file_missing",
  "interrupted",
  "download_failed",
]);

const DOWNLOAD_FAILURE_MESSAGES = Object.freeze({
  source_access_expired: "Download source authorization expired.",
  source_unavailable: "The download source is unavailable.",
  invalid_source: "The download source is invalid.",
  redirect_limit: "The download source redirected too many times.",
  network_timeout: "The download timed out.",
  local_storage_failed: "The download could not be written to local storage.",
  file_missing: "Downloaded file could not be found.",
  interrupted: "Download must be prepared again after restart.",
  download_failed: "The download failed.",
});

function clampBytes(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isOpaqueDownloadId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return Boolean(
    id &&
    id.length <= 200 &&
    !/^https?:\/\//i.test(id) &&
    !/^magnet:/i.test(id) &&
    !/^[a-f0-9]{32,64}$/i.test(id),
  );
}

function normalizeContentType(value) {
  const contentType = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType) &&
    contentType.length <= 200
    ? contentType
    : null;
}

function normalizeFailureReason(value, fallback = "download_failed") {
  return DOWNLOAD_FAILURE_REASONS.has(value) ? value : fallback;
}

function failureMessage(reason) {
  return (
    DOWNLOAD_FAILURE_MESSAGES[normalizeFailureReason(reason)] ||
    DOWNLOAD_FAILURE_MESSAGES.download_failed
  );
}

function classifyDownloadFailure(error) {
  const message = String(error?.message || error || "");
  if (/\b(?:401|403|410)\b|forbidden|\bgone\b/i.test(message)) {
    return "source_access_expired";
  }
  if (/too many download redirects/i.test(message)) return "redirect_limit";
  if (
    /download (?:url|source)|external downloads|must use http|invalid url|security boundary/i.test(
      message,
    )
  ) {
    return "invalid_source";
  }
  if (/timed?\s*out|etimedout/i.test(message)) return "network_timeout";
  if (/\b(?:eacces|enospc|erofs|eperm)\b/i.test(message)) {
    return "local_storage_failed";
  }
  if (/http\s+(?:4\d\d|5\d\d)|unavailable/i.test(message)) {
    return "source_unavailable";
  }
  return "download_failed";
}

function serializeDownloadJobV2(job) {
  if (!isOpaqueDownloadId(job.id)) return null;
  const status =
    job.status === "Completed"
      ? "Completed"
      : job.status === "Error"
        ? "Error"
        : "Paused";
  const contentType = normalizeContentType(job.contentType);

  return {
    id: String(job.id).trim(),
    status,
    filename: String(job.filename).trim().slice(0, 255),
    totalBytesWritten: clampBytes(job.totalBytesWritten),
    totalBytesExpectedToWrite: clampBytes(job.totalBytesExpectedToWrite),
    ...(contentType ? { contentType } : {}),
    metadataBytes: clampBytes(job.metadataBytes),
    ...(status === "Error"
      ? {
          failureReason: normalizeFailureReason(job.failureReason),
        }
      : {}),
    requiresReplan: status !== "Completed",
  };
}

function serializeDownloadJobsV2(jobs) {
  return {
    version: DOWNLOAD_JOBS_FILE_VERSION,
    jobs: Array.from(jobs, serializeDownloadJobV2).filter(Boolean),
  };
}

function normalizePersistedDownloadJob(record, fileState = {}) {
  if (
    !record ||
    typeof record !== "object" ||
    !isOpaqueDownloadId(record.id) ||
    typeof record.filename !== "string" ||
    !record.filename.trim() ||
    record.filename.trim().length > 255
  ) {
    return null;
  }

  const completedFileExists = Boolean(fileState.completedFileExists);
  const partialFileBytes = clampBytes(fileState.partialFileBytes);
  const completedFileBytes = clampBytes(fileState.completedFileBytes);
  const storedStatus = record.status;
  const status =
    storedStatus === "Completed"
      ? completedFileExists
        ? "Completed"
        : "Error"
      : storedStatus === "Error"
        ? "Error"
        : "Paused";
  const totalBytesWritten =
    partialFileBytes ||
    completedFileBytes ||
    clampBytes(record.totalBytesWritten);
  const failureReason =
    storedStatus === "Completed" && !completedFileExists
      ? "file_missing"
      : status === "Error"
        ? normalizeFailureReason(record.failureReason)
        : status === "Paused"
          ? "interrupted"
          : undefined;
  const contentType = normalizeContentType(record.contentType);

  return {
    id: record.id.trim(),
    status,
    filename: record.filename.trim(),
    totalBytesWritten,
    totalBytesExpectedToWrite: Math.max(
      totalBytesWritten,
      clampBytes(record.totalBytesExpectedToWrite),
    ),
    contentType,
    metadataBytes: clampBytes(record.metadataBytes),
    failureReason,
    requiresReplan: status !== "Completed",
  };
}

module.exports = {
  DOWNLOAD_JOBS_FILE_VERSION,
  classifyDownloadFailure,
  failureMessage,
  normalizePersistedDownloadJob,
  serializeDownloadJobsV2,
};
