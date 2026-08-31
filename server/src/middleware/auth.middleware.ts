import type { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { SessionService } from "../modules/auth/session.service.js";
import { normalizeDeviceId } from "@streamer/shared";

export interface AuthPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
  jti?: string;
  sid?: string;
}

type AccessTokenAuthenticationOptions = {
  deviceId?: string;
};

/** Maximum allowed token age in seconds (prevent replay of very old tokens) */
const MAX_TOKEN_AGE_SECONDS = 24 * 60 * 60; // 24 hours

// Small memory cache to throttle heartbeat DB writes (prevent connection floods on burst N+1 requests)
const heartbeatCache = new Map<string, number>();
const HEARTBEAT_CACHE_MAX = 10_000;
const HEARTBEAT_CACHE_TTL_MS = 60_000;

function isJwtVerificationError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;

  return ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
    error.name,
  );
}

function verifyAccessToken(token: string): AuthPayload {
  let decoded: string | jwt.JwtPayload;

  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch (primaryError) {
    if (
      env.jwtSecretPrevious &&
      primaryError instanceof Error &&
      primaryError.name === "JsonWebTokenError"
    ) {
      logger.debug(
        "JWT verification failed with primary secret — trying previous secret",
      );
      decoded = jwt.verify(token, env.jwtSecretPrevious);
    } else {
      throw primaryError;
    }
  }

  if (typeof decoded === "string" || !decoded.userId || !decoded.email) {
    throw new jwt.JsonWebTokenError("JWT payload is missing required claims");
  }

  return decoded as AuthPayload;
}

function scheduleSessionHeartbeat(
  payload: AuthPayload,
  deviceId: string,
  sessionId: string,
  ip: string,
  userAgent: string | undefined,
) {
  void import("../modules/auth/session.service.js")
    .then(({ SessionService }) =>
      SessionService.heartbeat(
        payload.userId,
        deviceId,
        sessionId,
        ip,
        userAgent,
      ),
    )
    .catch((err) => {
      logger.debug(
        { requestId: undefined, err },
        "Session heartbeat could not be scheduled",
      );
    });
}

export async function authenticateAccessToken(
  c: Context,
  next: Next,
  token: string,
  options: AccessTokenAuthenticationOptions = {},
) {
  let payload: AuthPayload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (!isJwtVerificationError(err)) {
      throw err;
    }

    // TokenExpiredError is expected — the client will auto-refresh via /auth/refresh
    // Only log as WARN for genuinely unexpected JWT failures (bad signature, malformed, etc.)
    if (err.name === "TokenExpiredError") {
      logger.debug(
        { requestId: c.get("requestId") },
        "JWT expired — client should refresh",
      );
    } else {
      logger.warn(
        { requestId: c.get("requestId"), err },
        "JWT verification failed",
      );
    }
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Validate iat (issued-at) to prevent token replay with very old tokens
  if (payload.iat) {
    const tokenAge = Math.floor(Date.now() / 1000) - payload.iat;
    if (tokenAge > MAX_TOKEN_AGE_SECONDS) {
      logger.warn(
        { requestId: c.get("requestId"), tokenAge },
        "JWT rejected — token too old (possible replay)",
      );
      return c.json({ error: "Token expired — please re-authenticate" }, 401);
    }
  }

  const sessionId = payload.sid || payload.jti;
  if (!sessionId || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const revocation = await SessionService.checkAccessToken(
    payload.userId,
    sessionId,
    payload.iat,
  );
  if (revocation === "revoked") {
    return c.json({ error: "Session has been revoked" }, 401);
  }
  if (
    (revocation === "unavailable" || revocation === "not_configured") &&
    env.nodeEnv === "production"
  ) {
    c.header("Retry-After", "5");
    return c.json(
      { error: "Session protection is temporarily unavailable" },
      503,
    );
  }

  c.set("user", payload);

  // Multi-Device Session Logic
  const deviceId = normalizeDeviceId(
    options.deviceId || c.req.header("x-device-id"),
  );
  const ip = c.req.header("x-forwarded-for") || "127.0.0.1";
  const userAgent = c.req.header("user-agent");

  // Proactive heartbeat — do not await it, so Redis/session bookkeeping does
  // not turn a valid authenticated request into an auth failure.
  const cacheKey = `${payload.userId}:${sessionId}`;
  const lastHeartbeat = heartbeatCache.get(cacheKey) || 0;
  const now = Date.now();

  if (now - lastHeartbeat > 10000) {
    heartbeatCache.set(cacheKey, now);
    scheduleSessionHeartbeat(payload, deviceId, sessionId, ip, userAgent);
    for (const [key, timestamp] of heartbeatCache) {
      if (now - timestamp > HEARTBEAT_CACHE_TTL_MS) heartbeatCache.delete(key);
    }
    while (heartbeatCache.size > HEARTBEAT_CACHE_MAX) {
      const oldest = heartbeatCache.keys().next().value;
      if (!oldest) break;
      heartbeatCache.delete(oldest);
    }
  }

  c.set("deviceId", deviceId);

  // Downstream route errors deliberately propagate to the global error
  // handler. They are not token-verification failures.
  await next();
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  return authenticateAccessToken(c, next, authHeader.slice(7));
}
