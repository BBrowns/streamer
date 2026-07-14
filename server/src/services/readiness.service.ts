import { env } from "../config/env.js";
import { prisma } from "../prisma/client.js";
import { checkRedisReadiness, type RedisReadinessStatus } from "./redis.js";

export type DatabaseReadinessStatus = "connected" | "disconnected";

interface ReadinessDependencies {
  checkDatabase?: () => Promise<void>;
  checkRedis?: () => Promise<RedisReadinessStatus>;
}

let shuttingDown = false;

export function markServerShuttingDown() {
  shuttingDown = true;
}

export function _resetServerReadinessState() {
  shuttingDown = false;
}

export async function checkServerReadiness(
  dependencies: ReadinessDependencies = {},
) {
  let database: DatabaseReadinessStatus = "connected";
  const checkDatabase =
    dependencies.checkDatabase ||
    (async () => {
      await prisma.$queryRaw`SELECT 1`;
    });

  try {
    await checkDatabase();
  } catch {
    database = "disconnected";
  }

  const redis = await (dependencies.checkRedis || checkRedisReadiness)();
  const redisRequired = Boolean(env.redisUrl) || env.instanceMode === "multi";
  const ready =
    !shuttingDown &&
    database === "connected" &&
    (!redisRequired || redis === "connected");

  return {
    ready,
    shuttingDown,
    dependencies: {
      database,
      redis,
    },
    runtime: {
      instanceMode: env.instanceMode || "single",
      rateLimitStore: env.redisUrl ? "redis" : "memory",
      emailDelivery: env.emailDeliveryMode || "log",
      trustProxyHops: env.trustProxyHops || 0,
    },
  } as const;
}
