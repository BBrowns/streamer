import { serve } from "@hono/node-server";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { injectWebSocket } from "../src/config/websocket.js";
import { syncService } from "../src/modules/sync/sync.service.js";

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
  afterEach(() => {
    vi.restoreAllMocks();
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
});
