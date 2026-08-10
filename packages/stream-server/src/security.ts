import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import net from "net";
import { lookup as dnsLookup } from "node:dns/promises";
import type { NextFunction, Request, Response } from "express";
import {
  bridgeAccessSessionV1Schema,
  bridgeCreateAccessSessionV1Schema,
  bridgeErrorResponseV1Schema,
  type BridgeAccessScope,
  type BridgeAccessSessionV1,
  type BridgeV1ErrorCode,
  type CreateBridgeAccessSessionV1,
} from "@streamer/shared";

export interface CastUrlValidationOptions {
  allowedHosts?: string[];
}

export interface CastUrlDnsValidationOptions extends CastUrlValidationOptions {
  lookup?: (
    hostname: string,
  ) => Promise<Array<{ address: string; family: number }>>;
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
const MAX_BRIDGE_V1_ACCESS_SESSIONS = 128;
const fallbackGatewayStreamSecret = randomBytes(32).toString("hex");

interface BridgeV1AccessSessionRecord {
  sessionId: string;
  tokenHash: string;
  scopes: Set<BridgeAccessScope>;
  expiresAt: number;
}

export interface BridgeV1AuthContext {
  principal: string;
  master: boolean;
  scopes: ReadonlySet<BridgeAccessScope>;
}

const bridgeV1AccessSessions = new Map<string, BridgeV1AccessSessionRecord>();

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

/**
 * Cast devices must receive a URL from an explicit bridge origin. Never derive
 * that origin from an untrusted HTTP Host header: a caller can otherwise make
 * the bridge advertise a poisoned or unreachable source URL.
 */
export function getConfiguredBridgePublicOrigin() {
  const raw = process.env.STREAMER_BRIDGE_PUBLIC_ORIGIN?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function hashBridgeCredential(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function getBridgeAuthDiagnostics() {
  const configured = Boolean(getConfiguredBridgeToken());
  return {
    required: isProductionRuntime() || configured,
    configured,
  };
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

function bridgeV1Error(
  res: Response,
  status: number,
  code: BridgeV1ErrorCode,
  message: string,
  retryable = false,
) {
  return res.status(status).json(
    bridgeErrorResponseV1Schema.parse({
      protocolVersion: 1,
      error: {
        code,
        message,
        retryable,
      },
    }),
  );
}

function pruneBridgeV1AccessSessions(now = Date.now()) {
  for (const [tokenHash, session] of bridgeV1AccessSessions) {
    if (session.expiresAt <= now) {
      bridgeV1AccessSessions.delete(tokenHash);
    }
  }
}

function authenticateBridgeV1(
  req: Request,
  res: Response,
): BridgeV1AuthContext | null {
  const masterToken = getConfiguredBridgeToken();
  if (!masterToken) {
    bridgeV1Error(
      res,
      503,
      "AUTH_NOT_CONFIGURED",
      "Bridge authentication is not configured.",
    );
    return null;
  }

  const providedToken = readRequestBridgeToken(req);
  if (!providedToken) {
    bridgeV1Error(
      res,
      401,
      "AUTH_REQUIRED",
      "Bridge authentication is required.",
    );
    return null;
  }

  if (safeEqual(providedToken, masterToken)) {
    return {
      principal: `master:${hashBridgeCredential(masterToken)}`,
      master: true,
      scopes: new Set<BridgeAccessScope>([
        "capabilities:read",
        "jobs:read",
        "jobs:write",
        "cast:read",
        "cast:write",
      ]),
    };
  }

  pruneBridgeV1AccessSessions();
  const tokenHash = hashBridgeCredential(providedToken);
  const session = bridgeV1AccessSessions.get(tokenHash);
  if (!session) {
    bridgeV1Error(
      res,
      401,
      "AUTH_REQUIRED",
      "Bridge authentication is required.",
    );
    return null;
  }

  return {
    principal: `session:${session.sessionId}`,
    master: false,
    scopes: session.scopes,
  };
}

function isLoopbackAddress(value?: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/^::ffff:/, "");
  if (normalized === "::1" || normalized === "localhost") return true;
  if (net.isIP(normalized) === 4) {
    return normalized.startsWith("127.");
  }
  return false;
}

export function requireBridgeV1Scope(scope: BridgeAccessScope) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = authenticateBridgeV1(req, res);
    if (!auth) return;
    if (!auth.master && !auth.scopes.has(scope)) {
      bridgeV1Error(
        res,
        403,
        "FORBIDDEN",
        "The bridge access token does not grant this scope.",
      );
      return;
    }
    res.locals.bridgeV1Auth = auth;
    next();
  };
}

export function requireBridgeV1MasterAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = authenticateBridgeV1(req, res);
  if (!auth) return;
  if (!auth.master) {
    bridgeV1Error(
      res,
      403,
      "FORBIDDEN",
      "Master bridge authentication is required.",
    );
    return;
  }
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    bridgeV1Error(
      res,
      403,
      "FORBIDDEN",
      "Bridge access sessions can only be created from loopback.",
    );
    return;
  }
  res.locals.bridgeV1Auth = auth;
  next();
}

export function getBridgeV1AuthContext(
  res: Response,
): BridgeV1AuthContext | undefined {
  return res.locals.bridgeV1Auth as BridgeV1AuthContext | undefined;
}

export function createBridgeV1AccessSession(
  input: CreateBridgeAccessSessionV1,
): BridgeAccessSessionV1 {
  const parsed = bridgeCreateAccessSessionV1Schema.parse(input);
  pruneBridgeV1AccessSessions();

  while (bridgeV1AccessSessions.size >= MAX_BRIDGE_V1_ACCESS_SESSIONS) {
    const oldest = bridgeV1AccessSessions.keys().next().value;
    if (!oldest) break;
    bridgeV1AccessSessions.delete(oldest);
  }

  const sessionId = randomUUID();
  const accessToken = randomBytes(32).toString("base64url");
  const tokenHash = hashBridgeCredential(accessToken);
  const expiresAt = Date.now() + parsed.ttlSeconds * 1_000;
  bridgeV1AccessSessions.set(tokenHash, {
    sessionId,
    tokenHash,
    scopes: new Set(parsed.scopes),
    expiresAt,
  });

  return bridgeAccessSessionV1Schema.parse({
    protocolVersion: 1,
    sessionId,
    accessToken,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

export function __resetBridgeV1AccessSessionsForTests() {
  bridgeV1AccessSessions.clear();
}

export function requireBridgeAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const expectedToken = getConfiguredBridgeToken();
  if (!expectedToken) {
    if (isProductionRuntime()) {
      res.status(503).json({
        error: "Bridge authentication is not configured",
        code: "BRIDGE_AUTH_NOT_CONFIGURED",
      });
      return;
    }

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

function createSignedStreamPath(
  routePrefix: string,
  jobId: string,
  now = Date.now(),
) {
  const expiresAt = now + getGatewayStreamUrlTtlMs();
  const signature = signGatewayStreamUrl(jobId, expiresAt);
  const params = new URLSearchParams({
    expires: String(expiresAt),
    signature,
  });

  return `${routePrefix}/${encodeURIComponent(jobId)}/stream?${params.toString()}`;
}

export function createSignedGatewayStreamPath(jobId: string, now = Date.now()) {
  return createSignedStreamPath("/api/gateway/jobs", jobId, now);
}

export function createSignedBridgeV1StreamPath(
  jobId: string,
  now = Date.now(),
) {
  return createSignedStreamPath("/api/bridge/v1/jobs", jobId, now);
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

  const privateRanges = new net.BlockList();
  privateRanges.addSubnet("fe80::", 10, "ipv6");
  privateRanges.addSubnet("fc00::", 7, "ipv6");
  privateRanges.addSubnet("ff00::", 8, "ipv6");

  return host === "::1" || host === "::" || privateRanges.check(host, "ipv6");
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

export async function validateCastPlaybackUrlWithDns(
  rawUrl: unknown,
  options: CastUrlDnsValidationOptions = {},
): Promise<CastUrlValidationResult> {
  const syntax = validateCastPlaybackUrl(rawUrl, options);
  if (!syntax.ok || !syntax.url) return syntax;

  const parsed = new URL(syntax.url);
  const host = normalizeHost(parsed.hostname);
  if (net.isIP(host)) return syntax;

  const allowedHosts = options.allowedHosts?.map(normalizeHost) ?? [];
  const exactBridgeHost = isAllowedHost(host, allowedHosts);
  const lookup =
    options.lookup ??
    ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(host);
  } catch {
    return { ok: false, reason: "Playback URL hostname could not be resolved" };
  }
  if (addresses.length === 0) {
    return { ok: false, reason: "Playback URL hostname could not be resolved" };
  }

  for (const result of addresses) {
    const address = normalizeHost(result.address);
    const version = net.isIP(address);
    const localOnly =
      (version === 4 && isLocalOnlyIpv4(address)) ||
      (version === 6 && isLocalOnlyIpv6(address));
    if (localOnly) {
      return { ok: false, reason: "Localhost playback URLs cannot be cast" };
    }

    const privateOrReserved =
      (version === 4 && isPrivateOrReservedIpv4(address)) ||
      (version === 6 && isPrivateOrReservedIpv6(address));
    if (privateOrReserved && !exactBridgeHost) {
      return {
        ok: false,
        reason: "Private network playback URLs must point to this bridge",
      };
    }
  }

  return syntax;
}
