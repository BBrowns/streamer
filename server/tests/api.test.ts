import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { request } from "./test-utils.js";
import { createApp } from "../src/app.js";

// Mock prisma
vi.mock("../src/prisma/client.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    emailVerificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    installedAddon: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

// Mock env
vi.mock("../src/config/env.js", () => ({
  env: {
    port: 3001,
    nodeEnv: "test",
    logLevel: "silent",
    databaseUrl: "mock",
    jwtSecret: "test-secret-key-for-unit-testing",
    jwtAccessExpiry: "15m",
    jwtRefreshExpiry: "7d",
    corsOrigins: ["http://localhost:8081"],
    addonTimeoutMs: 5000,
    addonMaxConcurrent: 10,
  },
}));

// Mock logger to be silent in tests
vi.mock("../src/config/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// Mock pino-http to avoid requiring real pino internals
vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

import { prisma } from "../src/prisma/client.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

describe("Auth Module", () => {
  let app: any;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user and return tokens", async () => {
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        passwordHash: await bcrypt.hash("Password123", 12),
        displayName: "Test User",
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
      };

      (prisma.user.findUnique as any).mockResolvedValue(null);
      (prisma.user.create as any).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as any).mockResolvedValue({});

      const res = await request(app).post("/api/auth/register").send({
        email: "test@example.com",
        password: "Password123",
        displayName: "Test User",
      });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe("test@example.com");
      expect(res.body.tokens.accessToken).toBeDefined();
      expect(res.body.tokens.refreshToken).toBeDefined();
    });

    it("should return 409 for duplicate email", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ id: "existing" });

      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "existing@example.com", password: "Password123" });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already registered");
    });

    it("should return 400 for invalid email", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "not-an-email", password: "Password123" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for short password", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@example.com", password: "123" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    it("should login with valid credentials", async () => {
      const passwordHash = await bcrypt.hash("correctpassword", 12);
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        passwordHash,
        displayName: null,
        createdAt: new Date(),
        emailVerified: true,
      });
      (prisma.refreshToken.create as any).mockResolvedValue({});

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "correctpassword" });

      expect(res.status).toBe(200);
      expect(res.body.tokens.accessToken).toBeDefined();
    });

    it("should return 401 for wrong password", async () => {
      const passwordHash = await bcrypt.hash("correctpassword", 12);
      (prisma.user.findUnique as any).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        passwordHash,
        emailVerified: true,
      });

      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", password: "wrongpassword" });

      expect(res.status).toBe(401);
    });
  });
});

describe("Health Check", () => {
  it("should return 200 on /health", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("Aggregator Module", () => {
  let app: any;
  let token: string;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
    token = jwt.sign(
      { userId: "user-1", email: "test@example.com" },
      "test-secret-key-for-unit-testing",
      { expiresIn: "15m" },
    );
  });

  describe("GET /api/catalog/:type", () => {
    it("should return 401 without auth token", async () => {
      const res = await request(app).get("/api/catalog/movie");
      expect(res.status).toBe(401);
    });

    it("should return empty metas when user has no add-ons", async () => {
      (prisma.installedAddon.findMany as any).mockResolvedValue([]);

      const res = await request(app)
        .get("/api/catalog/movie")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.metas).toEqual([]);
    });
  });

  describe("GET /api/meta/:type/:id", () => {
    it("should return 401 without auth token", async () => {
      const res = await request(app).get("/api/meta/movie/tt1234567");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/stream/:type/:id", () => {
    it("should return 401 without auth token", async () => {
      const res = await request(app).get("/api/stream/movie/tt1234567");
      expect(res.status).toBe(401);
    });

    it("should return empty streams when user has no add-ons", async () => {
      (prisma.installedAddon.findMany as any).mockResolvedValue([]);

      const res = await request(app)
        .get("/api/stream/movie/tt1234567")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.streams).toEqual([]);
    });
  });
});

describe("Add-on Module", () => {
  let app: any;
  let token: string;

  beforeEach(() => {
    app = createApp();
    vi.clearAllMocks();
    token = jwt.sign(
      { userId: "user-1", email: "test@example.com" },
      "test-secret-key-for-unit-testing",
      { expiresIn: "15m" },
    );
  });

  describe("GET /api/addons", () => {
    it("should return 401 without auth", async () => {
      const res = await request(app).get("/api/addons");
      expect(res.status).toBe(401);
    });

    it("should return empty list for new user", async () => {
      (prisma.installedAddon.findMany as any).mockResolvedValue([]);

      const res = await request(app)
        .get("/api/addons")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.addons).toEqual([]);
    });
  });

  describe("DELETE /api/addons/:id", () => {
    it("should return 404 for nonexistent addon", async () => {
      (prisma.installedAddon.findFirst as any).mockResolvedValue(null);

      const res = await request(app)
        .delete("/api/addons/nonexistent")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
