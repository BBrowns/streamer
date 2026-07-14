import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import {
  _resetStore,
  createSlidingWindowLimiter,
  rateLimiter,
} from "../src/middleware/rateLimiter.middleware.js";
import { redis } from "../src/services/redis.js";

// Mock redis
vi.mock("../src/services/redis.js", () => ({
  redis: {
    multi: vi.fn(),
  },
}));

describe("Rate Limiter Middleware (Redis)", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  const app = new Hono();
  app.get("/test", rateLimiter, (c) => c.text("ok"));

  beforeEach(() => {
    vi.clearAllMocks();
    _resetStore();
  });

  afterAll(() => {
    process.env.NODE_ENV = oldNodeEnv;
  });

  it("should allow request and set headers when under limit", async () => {
    const mockPipe = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0], // zremrangebyscore
        [null, 1], // zadd
        [null, 5], // zcard (current count)
        [null, 1], // pexpire
      ]),
    };
    (redis as any).multi.mockReturnValue(mockPipe);

    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1000");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("995");
    expect(mockPipe.zadd).toHaveBeenCalled();
  });

  it("should block request with 429 when over limit", async () => {
    const mockPipe = {
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 1001], // Over limit (max 1000)
        [null, 1],
      ]),
    };
    (redis as any).multi.mockReturnValue(mockPipe);

    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    const body = await res.json();
    expect(body.error).toContain("Too many requests");
  });

  it("falls back to bounded memory limiting in single-instance mode", async () => {
    (redis as any).multi.mockImplementation(() => {
      throw new Error("Redis connection lost");
    });

    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1000");
  });

  it("fails closed if Redis is unavailable in multi-instance mode", async () => {
    const limiter = createSlidingWindowLimiter(
      {
        windowMs: 60_000,
        max: 10,
        message: "Too many requests",
      },
      {
        redisClient: {
          multi: vi.fn(() => {
            throw new Error("Redis connection lost");
          }),
        } as any,
        instanceMode: "multi",
        bypassInTests: false,
      },
    );
    const protectedApp = new Hono();
    protectedApp.get("/test", limiter, (c) => c.text("ok"));

    const res = await protectedApp.request("/test");

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      code: "RATE_LIMIT_BACKEND_UNAVAILABLE",
    });
    expect(res.headers.get("Retry-After")).toBe("5");
  });

  it("does not trust forwarded client addresses unless proxy hops are configured", async () => {
    const limiter = createSlidingWindowLimiter(
      {
        windowMs: 60_000,
        max: 1,
        message: "Too many requests",
      },
      {
        redisClient: null,
        instanceMode: "single",
        trustProxyHops: 0,
        bypassInTests: false,
      },
    );
    const protectedApp = new Hono();
    protectedApp.get("/test", limiter, (c) => c.text("ok"));

    expect(
      (
        await protectedApp.request("/test", {
          headers: { "x-forwarded-for": "1.1.1.1" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await protectedApp.request("/test", {
          headers: { "x-forwarded-for": "2.2.2.2" },
        })
      ).status,
    ).toBe(429);
  });

  it("uses forwarded addresses when the trusted proxy hop is explicit", async () => {
    const limiter = createSlidingWindowLimiter(
      {
        windowMs: 60_000,
        max: 1,
        message: "Too many requests",
      },
      {
        redisClient: null,
        instanceMode: "single",
        trustProxyHops: 1,
        bypassInTests: false,
      },
    );
    const protectedApp = new Hono();
    protectedApp.get("/test", limiter, (c) => c.text("ok"));

    expect(
      (
        await protectedApp.request("/test", {
          headers: { "x-forwarded-for": "1.1.1.1" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await protectedApp.request("/test", {
          headers: { "x-forwarded-for": "2.2.2.2" },
        })
      ).status,
    ).toBe(200);
  });
});
