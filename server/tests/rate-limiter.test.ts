import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { rateLimiter } from "../src/middleware/rateLimiter.middleware.js";
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
    expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("95");
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
        [null, 101], // Over limit (max 100)
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

  it("should fail open if Redis throws an error", async () => {
    (redis as any).multi.mockImplementation(() => {
      throw new Error("Redis connection lost");
    });

    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    // Should allow request despite Redis failure (fail open)
    expect(res.status).toBe(200);
  });
});
