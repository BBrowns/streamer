import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, Next } from "hono";
import type { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redis } from "../services/redis.js";

interface WindowRecord {
  timestamps: number[];
}

type RateLimitRedis = Pick<Redis, "multi">;
type InstanceMode = "single" | "multi";

interface RateLimiterDependencies {
  redisClient?: RateLimitRedis | null;
  instanceMode?: InstanceMode;
  trustProxyHops?: number;
  bypassInTests?: boolean;
}

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix?: string;
}

const memoryStore = new Map<string, WindowRecord>();
let lastPrune = Date.now();
let lastRedisFailureLog = 0;
const PRUNE_INTERVAL = 5 * 60 * 1000;
const REDIS_FAILURE_LOG_INTERVAL = 30 * 1000;

function pruneMemoryStore(windowMs: number): void {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL) return;
  lastPrune = now;

  const cutoff = now - windowMs;
  for (const [key, record] of memoryStore) {
    record.timestamps = record.timestamps.filter(
      (timestamp) => timestamp > cutoff,
    );
    if (record.timestamps.length === 0) memoryStore.delete(key);
  }
}

async function checkRedisLimit(
  client: RateLimitRedis,
  key: string,
  windowMs: number,
  now: number,
): Promise<[number, number]> {
  const windowStart = now - windowMs;
  const pipe = client.multi();
  pipe.zremrangebyscore(key, 0, windowStart);
  pipe.zadd(key, now, `${now}-${randomUUID()}`);
  pipe.zcard(key);
  pipe.pexpire(key, windowMs);

  const results = await pipe.exec();
  if (!results) throw new Error("Redis rate-limit pipeline failed");
  if (results.some(([error]) => Boolean(error))) {
    throw new Error("Redis rate-limit pipeline returned an error");
  }

  const count = Number(results[2][1]);
  if (!Number.isFinite(count)) {
    throw new Error("Redis rate-limit count was invalid");
  }
  return [count, now + windowMs];
}

function checkMemoryLimit(
  key: string,
  windowMs: number,
  now: number,
): [number, number] {
  pruneMemoryStore(windowMs);
  const windowStart = now - windowMs;

  let record = memoryStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    memoryStore.set(key, record);
  }

  record.timestamps = record.timestamps.filter(
    (timestamp) => timestamp > windowStart,
  );
  const count = record.timestamps.length + 1;
  record.timestamps.push(now);

  const resetAt =
    record.timestamps.length > 1
      ? record.timestamps[0] + windowMs
      : now + windowMs;

  return [count, resetAt];
}

function normalizeAddress(value: string | undefined) {
  const address = value?.trim();
  return address && isIP(address) ? address : undefined;
}

export function resolveRateLimitClientAddress(
  c: Context,
  trustProxyHops: number,
) {
  let remoteAddress: string | undefined;
  try {
    remoteAddress = normalizeAddress(getConnInfo(c).remote.address);
  } catch {
    remoteAddress = undefined;
  }

  if (trustProxyHops <= 0) return remoteAddress || "unknown";

  const forwarded = (c.req.header("x-forwarded-for") || "")
    .split(",")
    .map((entry) => normalizeAddress(entry))
    .filter((entry): entry is string => Boolean(entry));
  const trustedIndex = forwarded.length - trustProxyHops;

  return trustedIndex >= 0
    ? forwarded[trustedIndex]
    : remoteAddress || "unknown";
}

function hashClientAddress(address: string) {
  return createHash("sha256").update(address).digest("hex").slice(0, 32);
}

function setLimitHeaders(
  c: Context,
  max: number,
  count: number,
  resetAt: number,
) {
  c.header("X-RateLimit-Limit", String(max));
  c.header("X-RateLimit-Remaining", String(Math.max(0, max - count)));
  c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

function logRedisFallback(instanceMode: InstanceMode) {
  const now = Date.now();
  if (now - lastRedisFailureLog < REDIS_FAILURE_LOG_INTERVAL) return;
  lastRedisFailureLog = now;
  logger.warn(
    { instanceMode },
    instanceMode === "multi"
      ? "Redis rate-limit backend unavailable; request rejected"
      : "Redis rate-limit backend unavailable; using single-instance memory fallback",
  );
}

export function createSlidingWindowLimiter(
  options: RateLimiterOptions,
  dependencies: RateLimiterDependencies = {},
) {
  const { windowMs, max, message, keyPrefix = "" } = options;

  return async (c: Context, next: Next) => {
    if (
      dependencies.bypassInTests !== false &&
      process.env.NODE_ENV === "test"
    ) {
      await next();
      return;
    }

    const instanceMode =
      dependencies.instanceMode || env.instanceMode || "single";
    const trustProxyHops =
      dependencies.trustProxyHops ?? env.trustProxyHops ?? 0;
    const client =
      dependencies.redisClient === undefined ? redis : dependencies.redisClient;
    const address = resolveRateLimitClientAddress(c, trustProxyHops);
    const key = `ratelimit:${keyPrefix}:${hashClientAddress(address)}`;
    const now = Date.now();

    let count: number;
    let resetAt: number;

    try {
      if (client) {
        [count, resetAt] = await checkRedisLimit(client, key, windowMs, now);
      } else if (instanceMode === "multi") {
        throw new Error("Redis is required in multi-instance mode");
      } else {
        [count, resetAt] = checkMemoryLimit(key, windowMs, now);
      }
    } catch {
      logRedisFallback(instanceMode);
      if (instanceMode === "multi") {
        c.header("Retry-After", "5");
        return c.json(
          {
            error: "Request protection is temporarily unavailable",
            code: "RATE_LIMIT_BACKEND_UNAVAILABLE",
          },
          503,
        );
      }
      [count, resetAt] = checkMemoryLimit(key, windowMs, now);
    }

    setLimitHeaders(c, max, count, resetAt);

    if (count > max) {
      c.header("Retry-After", String(Math.ceil((resetAt - now) / 1000)));
      return c.json({ error: message }, 429);
    }

    await next();
  };
}

export const rateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.rateLimitGlobalMax || 1000,
  message: "Too many requests, please try again later",
  keyPrefix: "global",
});

export const authRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "development" ? 100 : 20,
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
  lastRedisFailureLog = 0;
}
