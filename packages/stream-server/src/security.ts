import { timingSafeEqual } from "crypto";
import net from "net";
import type { NextFunction, Request, Response } from "express";

export interface CastUrlValidationOptions {
  allowedHosts?: string[];
}

export interface CastUrlValidationResult {
  ok: boolean;
  url?: string;
  reason?: string;
}

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "metadata.google.internal",
]);

function normalizeHost(host?: string | null) {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const endBracketIndex = trimmed.indexOf("]");
    return endBracketIndex >= 0 ? trimmed.slice(1, endBracketIndex) : trimmed;
  }

  const colonCount = (trimmed.match(/:/g) ?? []).length;
  if (colonCount === 1) {
    return trimmed.split(":")[0];
  }

  return trimmed;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getConfiguredBridgeToken() {
  return process.env.STREAMER_BRIDGE_TOKEN?.trim() || "";
}

function readRequestBridgeToken(req: Request) {
  const authorization = req.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return req.get("x-streamer-bridge-token")?.trim() || "";
}

export function requireBridgeAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const expectedToken = getConfiguredBridgeToken();
  if (!expectedToken) {
    next();
    return;
  }

  const providedToken = readRequestBridgeToken(req);
  if (providedToken && safeEqual(providedToken, expectedToken)) {
    next();
    return;
  }

  res.status(401).json({ error: "Bridge authentication required" });
}

function isAllowedHost(host: string, allowedHosts: string[]) {
  return allowedHosts.some(
    (allowedHost) => normalizeHost(allowedHost) === host,
  );
}

function isPrivateOrReservedIpv4(host: string) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateOrReservedIpv6(host: string) {
  return (
    host === "::1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  );
}

export function validateCastPlaybackUrl(
  rawUrl: unknown,
  options: CastUrlValidationOptions = {},
): CastUrlValidationResult {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { ok: false, reason: "Playback URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Playback URL is invalid" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Playback URL must use http or https" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Playback URL credentials are not allowed" };
  }

  const host = normalizeHost(parsed.hostname);
  const allowedHosts = options.allowedHosts?.map(normalizeHost) ?? [];

  if (LOCAL_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    return { ok: false, reason: "Localhost playback URLs cannot be cast" };
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4 && isPrivateOrReservedIpv4(host)) {
    if (!isAllowedHost(host, allowedHosts)) {
      return {
        ok: false,
        reason: "Private network playback URLs must point to this bridge",
      };
    }
  }

  if (ipVersion === 6 && isPrivateOrReservedIpv6(host)) {
    if (!isAllowedHost(host, allowedHosts)) {
      return {
        ok: false,
        reason: "Private network playback URLs must point to this bridge",
      };
    }
  }

  return { ok: true, url: parsed.toString() };
}
