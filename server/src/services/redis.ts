import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export type RedisReadinessStatus =
  | "connected"
  | "unavailable"
  | "not_configured";

export const redis = env.redisUrl
  ? new Redis(env.redisUrl, {
      lazyConnect: true,
      connectTimeout: 5000,
      commandTimeout: 2000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        return times <= 3 ? Math.min(times * 250, 1000) : null;
      },
    })
  : null;

if (redis) {
  redis.on("connect", () => {
    logger.info("Connected to Redis");
  });

  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });
} else {
  logger.warn(
    { instanceMode: env.instanceMode },
    "Redis is not configured; single-instance in-memory rate limiting is active",
  );
}

export async function connectRedis(): Promise<RedisReadinessStatus> {
  if (!redis) return "not_configured";

  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }
    await redis.ping();
    return "connected";
  } catch (error) {
    logger.error({ error }, "Redis startup check failed");
    return "unavailable";
  }
}

export async function checkRedisReadiness(): Promise<RedisReadinessStatus> {
  if (!redis) return "not_configured";
  if (redis.status !== "ready") return "unavailable";

  try {
    await redis.ping();
    return "connected";
  } catch (error) {
    logger.warn({ error }, "Redis readiness check failed");
    return "unavailable";
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!redis) return;

  try {
    if (redis.status === "ready") {
      await redis.quit();
    } else {
      redis.disconnect(false);
    }
  } catch (error) {
    logger.warn({ error }, "Redis graceful disconnect failed");
    redis.disconnect(false);
  }
}
