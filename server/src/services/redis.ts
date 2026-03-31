import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export const redis = env.redisUrl ? new Redis(env.redisUrl) : null;

if (redis) {
  redis.on("connect", () => {
    logger.info("Connected to Redis");
  });

  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });
} else {
  logger.warn("No REDIS_URL provided — falling back to in-memory state");
}
