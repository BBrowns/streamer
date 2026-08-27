"use strict";

const crypto = require("node:crypto");

const BONJOUR_INSTANCE_ID_BYTES = 6;
const BONJOUR_HOST_LABEL_MAX_LENGTH = 24;

function createDesktopBonjourInstanceId(randomBytes = crypto.randomBytes) {
  const bytes = randomBytes(BONJOUR_INSTANCE_ID_BYTES);
  if (!Buffer.isBuffer(bytes) || bytes.length !== BONJOUR_INSTANCE_ID_BYTES) {
    throw new Error("Bonjour identity generation returned invalid bytes");
  }
  return bytes.toString("hex");
}

function normalizeInstanceId(instanceId) {
  const normalized = String(instanceId || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{12}$/.test(normalized)) {
    throw new Error("Bonjour instance id must be a 12-character hex value");
  }
  return normalized;
}

function normalizeHostname(hostname) {
  const raw = String(hostname || "").trim();
  if (!raw || /[\\/]/.test(raw)) return "desktop";

  const normalized = raw
    .replace(/\.local$/i, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BONJOUR_HOST_LABEL_MAX_LENGTH);
  return normalized || "desktop";
}

function createDesktopBonjourServiceConfig({
  hostname,
  appVersion,
  port,
  instanceId,
}) {
  const id = normalizeInstanceId(instanceId);
  const normalizedPort = Number(port);
  if (
    !Number.isInteger(normalizedPort) ||
    normalizedPort < 1 ||
    normalizedPort > 65_535
  ) {
    throw new Error("Bonjour service port is invalid");
  }

  return {
    name: `Streamer Desktop (${normalizeHostname(hostname)}) [${id}]`,
    type: "streamer-bridge",
    protocol: "tcp",
    port: normalizedPort,
    txt: {
      version: String(appVersion || "unknown").trim() || "unknown",
      id,
    },
  };
}

module.exports = {
  createDesktopBonjourInstanceId,
  createDesktopBonjourServiceConfig,
};
