import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync } from "child_process";
import { request } from "./test-utils.js";
import crypto from "crypto";

let app: any;
let prisma: any;
let dbUri: string;

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

beforeAll(async () => {
  dbUri = `file:./test-${crypto.randomUUID()}.db`;
  process.env.DATABASE_URL = dbUri;
  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";
  process.env.LOG_LEVEL = "silent";

  execSync(
    "npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss",
    {
      env: { ...process.env, DATABASE_URL: dbUri },
      stdio: "inherit",
    },
  );

  const AppMod = await import("../src/app.js");
  app = AppMod.createApp();

  const PrismaMod = await import("../src/prisma/client.js");
  prisma = PrismaMod.prisma;
}, 60000);

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  try {
    const fs = await import("fs");
    fs.unlinkSync(dbUri.replace("file:", ""));
  } catch (e) { }
});

describe("Integration: Auth Flow", () => {
  const getTestUser = () => ({
    email: `integration-${crypto.randomUUID()}@test.com`,
    password: "securePassword123!",
    displayName: "Integration Tester",
  });

  it("should register a new user successfully", async () => {
    const testUser = getTestUser();
    const res = await request(app).post("/api/auth/register").send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();

    // Verify in DB
    const dbUser = await prisma.user.findUnique({
      where: { email: testUser.email },
    });
    expect(dbUser).toBeTruthy();
    expect(dbUser.displayName).toBe(testUser.displayName);
  });

  it("should login and return tokens", async () => {
    const testUser = getTestUser();
    // Seed user
    await request(app).post("/api/auth/register").send(testUser).expect(201);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();
  });

  it("should refresh token correctly", async () => {
    const testUser = getTestUser();
    const regRes = await request(app).post("/api/auth/register").send(testUser).expect(201);
    const refreshToken = regRes.body.tokens.refreshToken;

    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();
    expect(refreshRes.body.refreshToken).not.toBe(refreshToken); // Refresh rotation
  });
});

describe("Integration: Aggregator Logic", () => {
  let accessToken: string;

  beforeEach(async () => {
    const testUser = {
      email: `aggregator-${crypto.randomUUID()}@test.com`,
      password: "securePassword123!",
    };
    const regRes = await request(app).post("/api/auth/register").send(testUser).expect(201);
    accessToken = regRes.body.tokens.accessToken;
  });

  it("should return empty catalog if no addons installed", async () => {
    const res = await request(app)
      .get("/api/catalog/movie")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.metas).toEqual([]);
  });

  it("should allow installing an addon and retrieving its catalog", async () => {
    const addonUrl = "https://v3-cinemeta.strem.io/manifest.json";

    // Install Addon
    const installRes = await request(app)
      .post("/api/addons")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ transportUrl: addonUrl });

    expect(installRes.status).toBe(201);
    expect(installRes.body).toBeDefined(); // The response IS the addon in this case or has addon depending on controller

    // Fetch Catalog
    // Given that it's an integration test with real external HTTP requests,
    // we might hit real Cinemeta API.
    const catRes = await request(app)
      .get("/api/catalog/movie")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(catRes.status).toBe(200);
    // We expect Cinemeta to return some popular movies
    expect(catRes.body.metas.length).toBeGreaterThan(0);
    expect(catRes.body.metas[0].id).toBeDefined();
    expect(catRes.body.metas[0].name).toBeDefined();
  });
});
