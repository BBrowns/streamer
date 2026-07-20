import type { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export interface AuthPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
  jti?: string;
}

/** Maximum allowed token age in seconds (prevent replay of very old tokens) */
const MAX_TOKEN_AGE_SECONDS = 24 * 60 * 60; // 24 hours

// Small memory cache to throttle heartbeat DB writes (prevent connection floods on burst N+1 requests)
const heartbeatCache = new Map<string, number>();

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
  ip: string,
  userAgent: string | undefined,
) {
  void import("../modules/auth/session.service.js")
    .then(({ SessionService }) =>
      SessionService.heartbeat(payload.userId, deviceId, ip, userAgent),
    )
    .catch((err) => {
      logger.debug(
        { requestId: undefined, err },
        "Session heartbeat could not be scheduled",
      );
    });
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

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

  c.set("user", payload);

  // Multi-Device Session Logic
  const deviceId = c.req.header("x-device-id") || "unknown-browser";
  const ip = c.req.header("x-forwarded-for") || "127.0.0.1";
  const userAgent = c.req.header("user-agent");

  // Proactive heartbeat — do not await it, so Redis/session bookkeeping does
  // not turn a valid authenticated request into an auth failure.
  const cacheKey = `${payload.userId}:${deviceId}`;
  const lastHeartbeat = heartbeatCache.get(cacheKey) || 0;
  const now = Date.now();

  if (now - lastHeartbeat > 10000) {
    heartbeatCache.set(cacheKey, now);
    scheduleSessionHeartbeat(payload, deviceId, ip, userAgent);
  }

  c.set("deviceId", deviceId);

  // Downstream route errors deliberately propagate to the global error
  // handler. They are not token-verification failures.
  await next();
}
