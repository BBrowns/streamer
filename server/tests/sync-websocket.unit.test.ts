import { serve } from "@hono/node-server";
import jwt from "jsonwebtoken";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("../src/modules/auth/session.service.js", () => ({
  SessionService: { heartbeat: vi.fn() },
}));

let createApp: (typeof import("../src/app.js"))["createApp"];
let env: (typeof import("../src/config/env.js"))["env"];
let injectWebSocket: (typeof import("../src/config/websocket.js"))["injectWebSocket"];
let syncService: (typeof import("../src/modules/sync/sync.service.js"))["syncService"];

const originalEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
};

const TEST_DEVICE_ID = "desktop-browser-test";

function accessToken() {
  return jwt.sign(
    { userId: "sync-user", email: "sync@example.com" },
    env.jwtSecret,
    { expiresIn: "15m" },
  );
}

async function startTestServer() {
  const app = createApp();
  let resolvePort!: (port: number) => void;
  const listening = new Promise<number>((resolve) => {
    resolvePort = resolve;
  });
  const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
    resolvePort(info.port);
  });
  injectWebSocket(server);

  return { server, port: await listening };
}

function waitForConnectionMessage(ws: WebSocket) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for the sync WebSocket handshake"));
    }, 2_000);

    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        resolve(String(event.data));
      },
      { once: true },
    );
    ws.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("Sync WebSocket handshake failed"));
      },
      { once: true },
    );
  });
}

describe("sync WebSocket authentication", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL =
      "postgresql://streamer:streamer_dev@127.0.0.1:5432/streamer_test";
    process.env.JWT_SECRET = "sync-websocket-unit-secret";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "silent";

    [{ createApp }, { env }, { injectWebSocket }, { syncService }] =
      await Promise.all([
        import("../src/app.js"),
        import("../src/config/env.js"),
        import("../src/config/websocket.js"),
        import("../src/modules/sync/sync.service.js"),
      ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("authenticates browser clients without a custom Authorization header", async () => {
    const addConnection = vi.spyOn(syncService, "addConnection");
    const { server, port } = await startTestServer();
    const token = accessToken();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/sync/events`, [
      "streamer-sync-v1",
      `streamer-auth.${token}`,
      `streamer-device.${TEST_DEVICE_ID}`,
    ]);

    try {
      const message = await waitForConnectionMessage(ws);

      expect(ws.protocol).toBe("streamer-sync-v1");
      expect(JSON.parse(message)).toEqual({ event: "ping", data: "connected" });
      expect(addConnection).toHaveBeenCalledWith(
        "sync-user",
        expect.objectContaining({ deviceId: TEST_DEVICE_ID }),
      );
    } finally {
      ws.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("does not fall back to subprotocol credentials from an invalid explicit auth header", async () => {
    const token = accessToken();
    const response = await createApp().request("/api/sync/events", {
      headers: {
        Authorization: "Basic invalid",
        "Sec-WebSocket-Protocol": [
          "streamer-sync-v1",
          `streamer-auth.${token}`,
        ].join(", "),
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Missing or invalid Authorization header",
    });
  });

  it("rejects malformed browser credential subprotocols before upgrade", async () => {
    const response = await createApp().request("/api/sync/events", {
      headers: {
        "Sec-WebSocket-Protocol": "streamer-sync-v1, streamer-auth.not/a/token",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Missing or invalid sync credentials",
    });
  });
});
