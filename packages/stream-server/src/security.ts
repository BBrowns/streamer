import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import net from "net";
import type { NextFunction, Request, Response } from "express";

export interface CastUrlValidationOptions {
  allowedHosts?: string[];
}

export interface GatewayStreamUrlValidationOptions {
  now?: number;
  lastStreamAccessAt?: number;
  activeSignature?: string;
  activeGraceMs?: number;
}

export interface GatewayStreamUrlValidationResult {
  ok: boolean;
  reason?: "missing" | "invalid" | "expired";
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
const DEFAULT_GATEWAY_STREAM_URL_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_GATEWAY_ACTIVE_STREAM_GRACE_MS = 10 * 60 * 1000;
const fallbackGatewayStreamSecret = randomBytes(32).toString("hex");

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

function getGatewayStreamSigningSecret() {
  return (
    process.env.STREAMER_GATEWAY_STREAM_SECRET?.trim() ||
    getConfiguredBridgeToken() ||
    fallbackGatewayStreamSecret
  );
}

function getGatewayStreamUrlTtlMs() {
  const raw = Number(process.env.STREAMER_GATEWAY_STREAM_URL_TTL_MS);
  return Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_GATEWAY_STREAM_URL_TTL_MS;
}

function signGatewayStreamUrl(jobId: string, expiresAt: number) {
  return createHmac("sha256", getGatewayStreamSigningSecret())
    .update(`gateway-stream:v1:${jobId}:${expiresAt}`)
    .digest("base64url");
}

function normalizeQueryValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
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

export function createSignedGatewayStreamPath(jobId: string, now = Date.now()) {
  const expiresAt = now + getGatewayStreamUrlTtlMs();
  const signature = signGatewayStreamUrl(jobId, expiresAt);
  const params = new URLSearchParams({
    expires: String(expiresAt),
    signature,
  });

  return `/api/gateway/jobs/${encodeURIComponent(jobId)}/stream?${params.toString()}`;
}

export function validateGatewayStreamSignature(
  jobId: string,
  query: Pick<Request, "query">["query"],
  options: GatewayStreamUrlValidationOptions = {},
): GatewayStreamUrlValidationResult {
  const expiresRaw = normalizeQueryValue(query.expires);
  const signature = normalizeQueryValue(query.signature);
  if (!expiresRaw || !signature) {
    return { ok: false, reason: "missing" };
  }

  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    return { ok: false, reason: "invalid" };
  }

  const expected = signGatewayStreamUrl(jobId, expiresAt);
  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "invalid" };
  }

  const now = options.now ?? Date.now();
  if (expiresAt >= now) {
    return { ok: true };
  }

  const activeGraceMs =
    options.activeGraceMs ?? DEFAULT_GATEWAY_ACTIVE_STREAM_GRACE_MS;
  const lastStreamAccessAt = options.lastStreamAccessAt;
  if (
    lastStreamAccessAt &&
    options.activeSignature === signature &&
    now - lastStreamAccessAt >= 0 &&
    now - lastStreamAccessAt <= activeGraceMs
  ) {
    return { ok: true };
  }

  return { ok: false, reason: "expired" };
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

function isLocalOnlyIpv4(host: string) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a] = parts;
  return a === 0 || a === 127;
}

function ipv4FromMappedIpv6(host: string) {
  const dottedMatch = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dottedMatch) return dottedMatch[1];

  const hexMatch = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hexMatch) return null;

  const high = Number.parseInt(hexMatch[1], 16);
  const low = Number.parseInt(hexMatch[2], 16);
  if (Number.isNaN(high) || Number.isNaN(low)) return null;

  return [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255].join(".");
}

function isPrivateOrReservedIpv6(host: string) {
  const mappedIpv4 = ipv4FromMappedIpv6(host);
  if (mappedIpv4) return isPrivateOrReservedIpv4(mappedIpv4);

  return (
    host === "::1" ||
    host === "::" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("ff")
  );
}

function isLocalOnlyIpv6(host: string) {
  const mappedIpv4 = ipv4FromMappedIpv6(host);
  if (mappedIpv4) return isLocalOnlyIpv4(mappedIpv4);

  return host === "::" || host === "::1";
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
  if (
    (ipVersion === 4 && isLocalOnlyIpv4(host)) ||
    (ipVersion === 6 && isLocalOnlyIpv6(host))
  ) {
    return { ok: false, reason: "Localhost playback URLs cannot be cast" };
  }

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
