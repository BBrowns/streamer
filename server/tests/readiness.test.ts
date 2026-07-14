import { afterEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import {
  _resetServerReadinessState,
  checkServerReadiness,
  markServerShuttingDown,
} from "../src/services/readiness.service.js";

const originalRedisUrl = env.redisUrl;
const originalInstanceMode = env.instanceMode;

afterEach(() => {
  (env as any).redisUrl = originalRedisUrl;
  (env as any).instanceMode = originalInstanceMode;
  _resetServerReadinessState();
});

describe("server readiness", () => {
  it("is ready with a database and no optional Redis in single mode", async () => {
    (env as any).redisUrl = undefined;
    (env as any).instanceMode = "single";

    const readiness = await checkServerReadiness({
      checkDatabase: async () => undefined,
      checkRedis: async () => "not_configured",
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.runtime.rateLimitStore).toBe("memory");
  });

  it("is not ready when the database is unavailable", async () => {
    const readiness = await checkServerReadiness({
      checkDatabase: async () => {
        throw new Error("database unavailable");
      },
      checkRedis: async () => "not_configured",
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.dependencies.database).toBe("disconnected");
  });

  it("requires configured Redis to answer readiness checks", async () => {
    (env as any).redisUrl = "redis://configured";

    const readiness = await checkServerReadiness({
      checkDatabase: async () => undefined,
      checkRedis: async () => "unavailable",
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.dependencies.redis).toBe("unavailable");
  });

  it("becomes unready as soon as graceful shutdown starts", async () => {
    markServerShuttingDown();

    const readiness = await checkServerReadiness({
      checkDatabase: async () => undefined,
      checkRedis: async () => "not_configured",
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.shuttingDown).toBe(true);
  });
});
