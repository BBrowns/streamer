import type { Context, Next } from "hono";

/**
 * Sliding-window rate limiter for Hono.
 *
 * Uses a sorted array of timestamps per IP to compute the exact
 * number of requests in the trailing window — more accurate than
 * the fixed-window approach and resistant to burst-at-boundary attacks.
 *
 * Stale entries are pruned lazily on each check to prevent memory leaks.
 */

interface WindowRecord {
  timestamps: number[];
}

const store = new Map<string, WindowRecord>();

// Prune stale IPs every 5 minutes
const PRUNE_INTERVAL = 5 * 60 * 1000;
let lastPrune = Date.now();

function pruneStore(windowMs: number): void {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL) return;
  lastPrune = now;

  const cutoff = now - windowMs;
  for (const [key, record] of store) {
    record.timestamps = record.timestamps.filter((t) => t > cutoff);
    if (record.timestamps.length === 0) store.delete(key);
  }
}

function createSlidingWindowLimiter(opts: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix?: string;
}) {
  const { windowMs, max, message, keyPrefix = "" } = opts;

  return async (c: Context, next: Next) => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === "test") {
      await next();
      return;
    }

    pruneStore(windowMs);

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = store.get(key);
    if (!record) {
      record = { timestamps: [] };
      store.set(key, record);
    }

    // Drop timestamps outside the current window
    record.timestamps = record.timestamps.filter((t) => t > windowStart);

    const remaining = Math.max(0, max - record.timestamps.length);
    const resetAt =
      record.timestamps.length > 0
        ? new Date(record.timestamps[0] + windowMs)
        : new Date(now + windowMs);

    // Set standard rate-limit headers
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(resetAt.getTime() / 1000)));

    if (record.timestamps.length >= max) {
      c.header(
        "Retry-After",
        String(Math.ceil((resetAt.getTime() - now) / 1000)),
      );
      return c.json({ error: message }, 429);
    }

    record.timestamps.push(now);
    await next();
  };
}

/** Global rate limiter: 100 requests per 15 minutes */
export const rateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later",
  keyPrefix: "global",
});

/** Auth endpoint rate limiter: 20 requests per 15 minutes */
export const authRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many auth attempts, please try again later",
  keyPrefix: "auth",
});

/** Catalog endpoint rate limiter: 200 requests per 15 minutes */
export const catalogRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "Too many catalog requests, please try again later",
  keyPrefix: "catalog",
});

/** Export for testing */
export function _resetStore(): void {
  store.clear();
  lastPrune = Date.now();
}
