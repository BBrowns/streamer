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

let app: any;
let prisma: any;
let dbUri: string;

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

beforeAll(async () => {
  dbUri =
    process.env.DATABASE_URL ||
    "postgresql://streamer:streamer_dev@localhost:5432/streamer_db?schema=public";
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
});

/** Helper: register a test user and return access token */
async function createTestUser(
  email = `library-${Date.now()}-${crypto.randomUUID()}@test.com`,
) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "securePassword123!" });
  if (res.status !== 201) {
    throw new Error(
      `Failed to register test user: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.tokens.accessToken as string;
}

describe("Integration: Library Module", () => {
  let token: string;

  beforeEach(async () => {
    token = await createTestUser();
  });

  it("should add an item to the library", async () => {
    const res = await request(app)
      .post("/api/library")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        title: "The Shawshank Redemption",
        poster: "https://example.com/poster.jpg",
      });

    expect(res.status).toBe(201);
    expect(res.body.itemId).toBe("tt0111161");
    expect(res.body.title).toBe("The Shawshank Redemption");
    expect(res.body.type).toBe("movie");
  });

  it("should reject duplicate library items", async () => {
    await request(app)
      .post("/api/library")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        title: "The Shawshank Redemption",
      });

    const res = await request(app)
      .post("/api/library")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        title: "The Shawshank Redemption",
      });

    expect(res.status).toBe(409);
  });

  it("should list library items", async () => {
    await request(app)
      .post("/api/library")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "movie", itemId: "tt0111161", title: "Shawshank" });

    await request(app)
      .post("/api/library")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "series", itemId: "tt0903747", title: "Breaking Bad" });

    const res = await request(app)
      .get("/api/library")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("should remove an item from the library", async () => {
    await request(app)
      .post("/api/library")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "movie", itemId: "tt0111161", title: "Shawshank" });

    const delRes = await request(app)
      .delete("/api/library")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemId: "tt0111161" });

    expect(delRes.status).toBe(204);

    const listRes = await request(app)
      .get("/api/library")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.body.items).toHaveLength(0);
  });

  it("should check if an item is in the library", async () => {
    await request(app)
      .post("/api/library")
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "movie", itemId: "tt0111161", title: "Shawshank" });

    const yesRes = await request(app)
      .get("/api/library/check/tt0111161")
      .set("Authorization", `Bearer ${token}`);

    expect(yesRes.body.inLibrary).toBe(true);

    const noRes = await request(app)
      .get("/api/library/check/tt9999999")
      .set("Authorization", `Bearer ${token}`);

    expect(noRes.body.inLibrary).toBe(false);
  });
});

describe("Integration: Watch Progress", () => {
  let token: string;

  beforeEach(async () => {
    token = await createTestUser();
  });

  it("should save and retrieve watch progress", async () => {
    const progressRes = await request(app)
      .post("/api/library/progress")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        currentTime: 3600,
        duration: 8520,
        title: "The Shawshank Redemption",
      });

    expect(progressRes.status).toBe(200);
    expect(progressRes.body.currentTime).toBe(3600);

    const listRes = await request(app)
      .get("/api/library/progress")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].itemId).toBe("tt0111161");
  });

  it("should upsert progress (update existing entry)", async () => {
    await request(app)
      .post("/api/library/progress")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        currentTime: 1000,
        duration: 8520,
        title: "Shawshank",
      });

    await request(app)
      .post("/api/library/progress")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        currentTime: 5000,
        duration: 8520,
        title: "Shawshank",
      });

    const listRes = await request(app)
      .get("/api/library/progress")
      .set("Authorization", `Bearer ${token}`);

    // Should still only have 1 entry (upserted, not duplicated)
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].currentTime).toBe(5000);
  });

  it("should filter out completed items from continue watching", async () => {
    // 96% watched = considered complete
    await request(app)
      .post("/api/library/progress")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "movie",
        itemId: "tt0111161",
        currentTime: 9600,
        duration: 10000,
        title: "Completed Movie",
      });

    // 40% watched = still in progress
    await request(app)
      .post("/api/library/progress")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "movie",
        itemId: "tt0903747",
        currentTime: 4000,
        duration: 10000,
        title: "In Progress Movie",
      });

    const res = await request(app)
      .get("/api/library/progress")
      .set("Authorization", `Bearer ${token}`);

    // Only the in-progress item should appear
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("In Progress Movie");
  });
});
