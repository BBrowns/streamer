"use strict";

const path = require("path");
const { fileURLToPath } = require("url");

const DEV_RENDERER_PORT = "8081";

const INVOKE_IPC_CHANNELS = Object.freeze([
  "check-file",
  "inspect-file",
  "delete-file",
  "get-bridge-info",
  "restart-bridge",
  "get-storage-info",
  "get-update-status",
  "check-for-updates",
  "open-update-page",
  "download-media",
  "download-job-start",
  "download-job-get",
  "download-job-pause",
  "download-job-resume",
  "download-job-cancel",
]);

const SEND_IPC_CHANNELS = Object.freeze(["handoff-play"]);

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
}

function isLoopbackHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    normalizeHostname(hostname),
  );
}

function isAllowedDevRendererUrl(parsedUrl) {
  return (
    parsedUrl.protocol === "http:" &&
    parsedUrl.port === DEV_RENDERER_PORT &&
    isLoopbackHostname(parsedUrl.hostname)
  );
}

function isFileUrlInsideRoots(parsedUrl, allowedFileRoots = []) {
  if (parsedUrl.protocol !== "file:") return false;

  let filePath;
  try {
    filePath = path.resolve(fileURLToPath(parsedUrl));
  } catch {
    return false;
  }

  return allowedFileRoots.some((root) => {
    if (!root) return false;
    const rootPath = path.resolve(root);
    const relativePath = path.relative(rootPath, filePath);
    return (
      relativePath &&
      !relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath)
    );
  });
}

function isAllowedRendererUrl(rawUrl, options = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return false;
  }

  if (options.allowDevServer && isAllowedDevRendererUrl(parsedUrl)) {
    return true;
  }

  if (isFileUrlInsideRoots(parsedUrl, options.allowedFileRoots)) {
    return true;
  }

  return false;
}

function isAllowedExternalUrl(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function createContentSecurityPolicy(options = {}) {
  const allowDevServer = Boolean(options.allowDevServer);
  const scriptSrc = ["'self'"];
  const connectSrc = [
    "'self'",
    "https:",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://[::1]:3001",
    "ws://localhost:3001",
    "ws://127.0.0.1:3001",
    "ws://[::1]:3001",
    "http://localhost:11470",
    "http://127.0.0.1:11470",
    "http://[::1]:11470",
  ];

  if (allowDevServer) {
    scriptSrc.push(
      "'unsafe-inline'",
      "'unsafe-eval'",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "http://[::1]:8081",
    );
    connectSrc.push(
      "http://localhost:8081",
      "http://127.0.0.1:8081",
      "http://[::1]:8081",
      "ws://localhost:8081",
      "ws://127.0.0.1:8081",
      "ws://[::1]:8081",
    );
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: streamer: https: http:",
    "media-src 'self' blob: streamer: https: http:",
    `connect-src ${connectSrc.join(" ")}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function requireIpcString(value, field, maxLength = 512) {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new Error(`${field} is invalid`);
  }

  return trimmed;
}

function normalizeIpcId(value) {
  return requireIpcString(value, "id", 200);
}

function normalizeLocalUri(value) {
  return requireIpcString(value, "localUri", 2048);
}

function normalizeDownloadIpcArgs(id, rawUrl, filename) {
  const parsedUrl = new URL(requireIpcString(rawUrl, "url", 8192));
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Download URL must use HTTP or HTTPS");
  }

  return {
    id: normalizeIpcId(id),
    url: parsedUrl.toString(),
    filename: requireIpcString(filename, "filename", 255),
  };
}

function normalizeHandoffPayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("handoff payload must be an object");
  }

  return {
    magnet: requireIpcString(data.magnet, "magnet", 8192),
    position: Math.max(0, Number(data.position) || 0),
    title:
      typeof data.title === "string" ? data.title.trim().slice(0, 500) : "",
    itemId:
      typeof data.itemId === "string" ? data.itemId.trim().slice(0, 200) : "",
  };
}

module.exports = {
  INVOKE_IPC_CHANNELS,
  SEND_IPC_CHANNELS,
  createContentSecurityPolicy,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
  normalizeDownloadIpcArgs,
  normalizeHandoffPayload,
  normalizeIpcId,
  normalizeLocalUri,
};
