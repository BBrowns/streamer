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

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;

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
    await next();
  } catch (err: any) {
    // TokenExpiredError is expected — the client will auto-refresh via /auth/refresh
    // Only log as WARN for genuinely unexpected JWT failures (bad signature, malformed, etc.)
    if (err?.name === "TokenExpiredError") {
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
}
