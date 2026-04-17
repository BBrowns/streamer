import type { Context, Next } from "hono";
import { redis } from "../services/redis.js";

interface WindowRecord {
  timestamps: number[];
}

const memoryStore = new Map<string, WindowRecord>();
let lastPrune = Date.now();
const PRUNE_INTERVAL = 5 * 60 * 1000;

function pruneMemoryStore(windowMs: number): void {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL) return;
  lastPrune = now;

  const cutoff = now - windowMs;
  for (const [key, record] of memoryStore) {
    record.timestamps = record.timestamps.filter((t) => t > cutoff);
    if (record.timestamps.length === 0) memoryStore.delete(key);
  }
}

async function checkRedisLimit(
  key: string,
  windowMs: number,
  max: number,
  now: number,
): Promise<[number, number]> {
  if (!redis) throw new Error("Redis not connected");

  const windowStart = now - windowMs;

  // Start pipeline
  const pipe = redis.multi();
  // Remove old timestamps
  pipe.zremrangebyscore(key, 0, windowStart);
  // Add current request
  pipe.zadd(key, now, `${now}-${Math.random().toString(36).slice(2)}`);
  // Count remaining in window
  pipe.zcard(key);
  // Set TTL so stale keys expire
  pipe.pexpire(key, windowMs);

  const results = await pipe.exec();
  if (!results) throw new Error("Redis pipeline failed");

  // zcard result
  const count = results[2][1] as number;
  return [count, now + windowMs]; // rough reset time
}

function checkMemoryLimit(
  key: string,
  windowMs: number,
  max: number,
  now: number,
): [number, number] {
  pruneMemoryStore(windowMs);
  const windowStart = now - windowMs;

  let record = memoryStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    memoryStore.set(key, record);
  }

  record.timestamps = record.timestamps.filter((t) => t > windowStart);
  const count = record.timestamps.length + 1;
  record.timestamps.push(now);

  const resetAt =
    record.timestamps.length > 1
      ? record.timestamps[0] + windowMs
      : now + windowMs;

  return [count, resetAt];
}

function createSlidingWindowLimiter(opts: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix?: string;
}) {
  const { windowMs, max, message, keyPrefix = "" } = opts;

  return async (c: Context, next: Next) => {
    if (process.env.NODE_ENV === "test") {
      await next();
      return;
    }

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "unknown";

    const key = `ratelimit:${keyPrefix}:${ip}`;
    const now = Date.now();

    try {
      const [count, resetAt] = redis
        ? await checkRedisLimit(key, windowMs, max, now)
        : checkMemoryLimit(key, windowMs, max, now);

      const remaining = Math.max(0, max - count);

      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", String(remaining));
      c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

      if (count > max) {
        c.header("Retry-After", String(Math.ceil((resetAt - now) / 1000)));
        return c.json({ error: message }, 429);
      }

      await next();
    } catch (err) {
      // If Redis fails, silently allow request (fail open) rather than blocking everything
      await next();
    }
  };
}

export const rateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later",
  keyPrefix: "global",
});

export const authRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many auth attempts, please try again later",
  keyPrefix: "auth",
});

export const catalogRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: "Too many catalog requests, please try again later",
  keyPrefix: "catalog",
});

export function _resetStore(): void {
  memoryStore.clear();
  lastPrune = Date.now();
}
