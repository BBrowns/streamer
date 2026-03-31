import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import { execSync } from "child_process";
import { request } from "./test-utils.js";
import crypto from "crypto";
import axios from "axios";

// Mock axios
vi.mock("axios");
const mockedAxios = vi.mocked(axios);

let app: any;
let prisma: any;
let dbUri: string;

beforeAll(async () => {
  const envUrl = process.env.DATABASE_URL;
  dbUri =
    envUrl?.startsWith("postgresql://") || envUrl?.startsWith("postgres://")
      ? envUrl
      : "postgresql://streamer:streamer_dev@127.0.0.1:5432/streamer_db?schema=public";

  process.env.DATABASE_URL = dbUri;
  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";
  process.env.LOG_LEVEL = "debug";

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
});

async function createTestUser(
  email = `trakt-${Date.now()}-${crypto.randomUUID()}@test.com`,
) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "securePassword123!" });
  return {
    userId: res.body.user.id,
    token: res.body.tokens.accessToken as string,
  };
}

describe("Integration: Trakt Synchronization", () => {
  let user: { userId: string; token: string };

  beforeEach(async () => {
    user = await createTestUser();
    vi.clearAllMocks();

    // Link Trakt account for this user
    await prisma.traktToken.create({
      data: {
        userId: user.userId,
        accessToken: "trakt-access-token",
        refreshToken: "trakt-refresh-token",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  });

  it("should sync progress to Trakt when watch progress is updated", async () => {
    vi.mocked(mockedAxios.post).mockResolvedValue({ data: {} } as any);

    const res = await request(app)
      .post("/api/library/progress")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        currentTime: 3600,
        duration: 8520,
        title: "The Shawshank Redemption",
      });

    expect(res.status).toBe(200);

    // Verify Trakt sync was triggered (wait for background task)
    await vi.waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining("/sync/history"),
        expect.objectContaining({
          movies: [
            expect.objectContaining({
              ids: expect.objectContaining({ imdb: "tt0111161" }),
            }),
          ],
        }),
        expect.any(Object),
      );
    });
  });

  it("should queue Trakt sync if the API is down", async () => {
    vi.mocked(mockedAxios.post).mockRejectedValue(new Error("Trakt API Down"));

    const res = await request(app)
      .post("/api/library/progress")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        currentTime: 3600,
        duration: 8520,
        title: "The Shawshank Redemption",
      });

    expect(res.status).toBe(200); // Should still succeed locally

    // Verify it was added to the queue (wait for background task)
    await vi.waitFor(async () => {
      const queueItems = await prisma.traktSyncQueue.findMany({
        where: { userId: user.userId },
      });
      expect(queueItems).toHaveLength(1);
      expect(queueItems[0].imdbId).toBe("tt0111161");
      expect(queueItems[0].title).toBe("The Shawshank Redemption");
    });
  });

  it("should scrobble to Trakt via the dedicated endpoint", async () => {
    vi.mocked(mockedAxios.post).mockResolvedValue({ data: {} } as any);

    const res = await request(app)
      .post("/api/trakt/scrobble/start")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        title: "The Shawshank Redemption",
        progress: 10,
      });

    expect(res.status).toBe(200);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/scrobble/start"),
      expect.objectContaining({
        progress: 10,
        movie: expect.objectContaining({ title: "The Shawshank Redemption" }),
      }),
      expect.any(Object),
    );
  });
});
