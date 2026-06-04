"use strict";

const path = require("path");
const { fileURLToPath, pathToFileURL } = require("url");

const INTERNAL_DOWNLOAD_FILES = new Set([
  "download-jobs.json",
  "download-jobs.json.tmp",
]);

function toStreamerUri(filePath) {
  const localUrl = pathToFileURL(path.resolve(filePath));
  return `streamer://${localUrl.pathname}`;
}

function resolveManagedDownloadPath(downloadsPath, localUri) {
  if (typeof localUri !== "string") {
    return null;
  }

  let filePath;
  try {
    const localUrl = new URL(localUri);
    if (
      localUrl.protocol !== "streamer:" ||
      localUrl.host ||
      localUrl.search ||
      localUrl.hash
    ) {
      return null;
    }
    filePath = path.resolve(
      fileURLToPath(new URL(`file://${localUrl.pathname}`)),
    );
  } catch {
    return null;
  }

  const rootPath = path.resolve(downloadsPath);
  const relativePath = path.relative(rootPath, filePath);
  const baseName = path.basename(filePath);

  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    INTERNAL_DOWNLOAD_FILES.has(baseName) ||
    baseName.endsWith(".part")
  ) {
    return null;
  }

  return filePath;
}

module.exports = {
  resolveManagedDownloadPath,
  toStreamerUri,
};
