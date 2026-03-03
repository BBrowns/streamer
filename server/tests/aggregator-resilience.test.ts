import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { execSync } from "child_process";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { request } from "./test-utils.js";

let container: StartedPostgreSqlContainer;
let mainApp: any;
let prisma: any;

// Mock logger
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

vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("streamer_test")
    .withUsername("test_user")
    .withPassword("test_pass")
    .start();

  const dbUri = container.getConnectionUri() + "?schema=public";
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
  mainApp = AppMod.createApp();

  const PrismaMod = await import("../src/prisma/client.js");
  prisma = PrismaMod.prisma;
}, 60000);

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  try {
    const fs = await import("fs");
    fs.unlinkSync(dbUri.replace("file:", ""));
  } catch (e) {}
});

beforeEach(async () => {
  if (prisma) {
    await prisma.watchProgress.deleteMany();
    await prisma.libraryItem.deleteMany();
    await prisma.installedAddon.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany();
  }
});

describe("Aggregator Resilience: Addon Timeout Handling", () => {
  it("should return partial results when slow add-on times out", async () => {
    // Create a mock "slow add-on" server
    const slowAddon = new Hono();
    slowAddon.get("/manifest.json", (c) => {
      return c.json({
        id: "slow.test.addon",
        version: "1.0.0",
        name: "Slow Test Addon",
        description: "A deliberately slow add-on",
        resources: ["catalog", "stream"],
        types: ["movie"],
        catalogs: [{ type: "movie", id: "slow-movies", name: "Slow Movies" }],
      });
    });

    // Simulate a 10-second delay (well beyond the 5s timeout)
    slowAddon.get("/catalog/movie/:catalogId", async (c) => {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      return c.json({
        metas: [
          {
            id: "tt9999999",
            type: "movie",
            name: "Slow Movie",
            poster: "https://example.com/slow.jpg",
          },
        ],
      });
    });

    // Start the slow add-on on a random port
    const slowServer = serve({ fetch: slowAddon.fetch, port: 0 });
    const slowPort = (slowServer.address() as any).port;

    try {
      // Register user and install the slow add-on
      const regRes = await request(mainApp)
        .post("/api/auth/register")
        .send({ email: "resilience@test.com", password: "securePass123!" });

      const token = regRes.body.tokens.accessToken;

      const installRes = await request(mainApp)
        .post("/api/addons")
        .set("Authorization", `Bearer ${token}`)
        .send({ transportUrl: `http://localhost:${slowPort}` });

      expect(installRes.status).toBe(201);

      // Request catalog — should return within the timeout window (not hang for 10s)
      const start = Date.now();
      const catRes = await request(mainApp)
        .get("/api/catalog/movie")
        .set("Authorization", `Bearer ${token}`);

      const elapsed = Date.now() - start;

      // The request should complete well before the 10s add-on delay
      // (timeout is 5s, but with retry that's ~7s max)
      expect(elapsed).toBeLessThan(9000);
      expect(catRes.status).toBe(200);
      // Results will be empty because the slow add-on timed out
      expect(catRes.body.metas).toEqual([]);
    } finally {
      slowServer.close();
    }
  }, 15000);
});

describe("Aggregator: Sanitized Results", () => {
  it("should return empty streams if no addons are installed", async () => {
    const regRes = await request(mainApp)
      .post("/api/auth/register")
      .send({ email: "sanitize@test.com", password: "securePass123!" });

    const token = regRes.body.tokens.accessToken;

    const res = await request(mainApp)
      .get("/api/stream/movie/tt0111161")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.streams).toEqual([]);
  });
});

describe("Feature Flags", () => {
  it("should expose feature flags in the health endpoint", async () => {
    const res = await request(mainApp).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.features).toBeDefined();
    expect(typeof res.body.features["continue-watching"]).toBe("boolean");
    expect(typeof res.body.features["server-driven-ui"]).toBe("boolean");
  });
});
