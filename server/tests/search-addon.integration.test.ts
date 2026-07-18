import { execSync } from "child_process";
import crypto from "crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { request } from "./test-utils.js";
import { startSearchAddonFixture } from "./fixtures/searchable-addon.fixture.js";

let app: any;
let prisma: any;
let addonFixture: ReturnType<typeof startSearchAddonFixture>;
let resetFailedAttempts: () => void;
let resetRateLimitStore: () => void;
let testDatabaseSchema: string;
const createdUserIds: string[] = [];
const originalEnvironment: Record<string, string | undefined> = {};

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
  for (const key of [
    "DATABASE_URL",
    "JWT_SECRET",
    "PORT",
    "NODE_ENV",
    "LOG_LEVEL",
    "ADDON_ALLOW_PRIVATE_NETWORKS",
  ]) {
    originalEnvironment[key] = process.env[key];
  }

  const configuredDatabase = process.env.DATABASE_URL;
  const baseDatabaseUrl =
    configuredDatabase?.startsWith("postgresql://") ||
    configuredDatabase?.startsWith("postgres://")
      ? configuredDatabase
      : "postgresql://streamer:streamer_dev@127.0.0.1:5432/streamer_db?schema=public";
  const parsedDatabaseUrl = new URL(baseDatabaseUrl);
  testDatabaseSchema = `search_addon_${crypto.randomUUID().replaceAll("-", "")}`;
  parsedDatabaseUrl.searchParams.set("schema", testDatabaseSchema);
  const databaseUrl = parsedDatabaseUrl.toString();

  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = "search-addon-integration-secret";
  process.env.PORT = "0";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.ADDON_ALLOW_PRIVATE_NETWORKS = "true";

  execSync(
    "npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss",
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    },
  );

  const AppModule = await import("../src/app.js");
  app = AppModule.createApp();

  const AuthModule = await import("../src/modules/auth/auth.service.js");
  resetFailedAttempts = AuthModule._resetFailedAttempts;
  const RateLimitModule =
    await import("../src/middleware/rateLimiter.middleware.js");
  resetRateLimitStore = RateLimitModule._resetStore;

  const PrismaModule = await import("../src/prisma/client.js");
  prisma = PrismaModule.prisma;
  addonFixture = startSearchAddonFixture();
}, 60_000);

afterEach(async () => {
  addonFixture.resetRequests();
  resetFailedAttempts();
  resetRateLimitStore();

  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.splice(0, createdUserIds.length);
  }
});

afterAll(async () => {
  addonFixture?.close();
  if (prisma) {
    await prisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${testDatabaseSchema}" CASCADE`,
    );
    await prisma.$disconnect();
  }

  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

async function registerUser(label: string) {
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      email: `search-addon-${label}-${crypto.randomUUID()}@test.invalid`,
      password: "securePassword123!",
      displayName: "Search add-on integration",
    })
    .expect(201);

  createdUserIds.push(response.body.user.id);
  return response.body.tokens.accessToken as string;
}

async function installAddon(token: string, path: string) {
  return request(app)
    .post("/api/addons")
    .set("Authorization", `Bearer ${token}`)
    .send({ transportUrl: `${addonFixture.baseUrl}/${path}/manifest.json` })
    .expect(201);
}

async function search(token: string, query: string) {
  return request(app)
    .get(`/api/search?${new URLSearchParams(query).toString()}`)
    .set("Authorization", `Bearer ${token}`);
}

describe("Search add-on capability integration", () => {
  it("uses the declared searchable movie and series catalogs instead of the first catalogs", async () => {
    const token = await registerUser("multi-catalog");
    await installAddon(token, "searchable");

    const movieResponse = await search(
      token,
      "q=The Matrix&type=movie&mode=results&limit=10",
    );
    expect(movieResponse.status).toBe(200);
    expect(movieResponse.body.metas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tt0133093",
          type: "movie",
          name: "The Matrix",
        }),
      ]),
    );

    const seriesResponse = await search(
      token,
      "q=Breaking Bad&type=series&mode=results&limit=10",
    );
    expect(seriesResponse.status).toBe(200);
    expect(seriesResponse.body.metas).toEqual([
      expect.objectContaining({
        id: "tt0903747",
        type: "series",
        name: "Breaking Bad",
      }),
    ]);

    expect(addonFixture.requests).toEqual([
      expect.objectContaining({
        provider: "searchable",
        type: "movie",
        catalogId: "search-movies",
        search: "The Matrix",
      }),
      expect.objectContaining({
        provider: "searchable",
        type: "series",
        catalogId: "search-series",
        search: "Breaking Bad",
      }),
    ]);
  });

  it("returns an honest empty result after searchable providers complete", async () => {
    const token = await registerUser("empty");
    await installAddon(token, "searchable");

    const response = await search(
      token,
      "q=qzxvbnmwlakdjsfhgpoiu&type=all&mode=results&limit=10",
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      metas: [],
      total: 0,
      attemptedProviders: 1,
      successfulProviders: 1,
      failedProviderIds: [],
      partial: false,
    });
    expect(addonFixture.requests.map((entry) => entry.catalogId)).toEqual([
      "search-movies",
      "search-series",
    ]);
  });

  it("keeps healthy results and reports a failing searchable provider as partial", async () => {
    const token = await registerUser("partial");
    await installAddon(token, "searchable");
    const failingAddon = await installAddon(token, "failing");

    const response = await search(
      token,
      "q=The Matrix&type=movie&mode=results&limit=10",
    );

    expect(response.status).toBe(200);
    expect(response.body.metas[0]).toMatchObject({
      id: "tt0133093",
      type: "movie",
      name: "The Matrix",
    });
    expect(response.body).toMatchObject({
      attemptedProviders: 2,
      successfulProviders: 1,
      failedProviderIds: [failingAddon.body.id],
      partial: true,
    });
  });

  it("does not fan out to browse-only or stream-only installed add-ons", async () => {
    const token = await registerUser("no-provider");
    await installAddon(token, "browse-only");
    await installAddon(token, "stream-only");

    const response = await search(
      token,
      "q=The Matrix&type=all&mode=results&limit=10",
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      metas: [],
      total: 0,
      attemptedProviders: 0,
      successfulProviders: 0,
      failedProviderIds: [],
      partial: false,
    });
    expect(addonFixture.requests).toEqual([]);
  });
});

describe("Live searchable add-on evidence", () => {
  it.runIf(process.env.RUN_REAL_ADDON_SEARCH_E2E === "1")(
    "returns The Matrix through TorrentClaw's deployed tc-search catalog",
    async () => {
      const token = await registerUser("torrentclaw-live");
      const installResponse = await request(app)
        .post("/api/addons")
        .set("Authorization", `Bearer ${token}`)
        .send({
          transportUrl: "https://torrentclaw.com/api/stremio/manifest.json",
        })
        .expect(201);

      const response = await search(
        token,
        "q=The Matrix&type=movie&mode=results&limit=6",
      );

      expect(response.status).toBe(200);
      expect(response.body.metas[0]).toMatchObject({
        id: "tt0133093",
        type: "movie",
        name: "The Matrix",
      });
      expect(response.body.providersByContent["movie:tt0133093"]).toContain(
        installResponse.body.id,
      );
      expect(response.body.attemptedProviders).toBe(1);
      expect(response.body.successfulProviders).toBe(1);
    },
    45_000,
  );
});
