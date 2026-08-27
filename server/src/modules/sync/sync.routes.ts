import { Hono } from "hono";
import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { parseSyncWebSocketProtocols } from "@streamer/shared";
import { upgradeWebSocket } from "../../config/websocket.js";
import {
  authenticateAccessToken,
  authMiddleware,
} from "../../middleware/auth.middleware.js";
import type { HonoEnv } from "../../types/hono.js";
import { syncService } from "./sync.service.js";
import { logger } from "../../config/logger.js";

export const syncRouter = new Hono<HonoEnv>();

async function syncAuthMiddleware(c: Context, next: () => Promise<void>) {
  // Native React Native clients can attach the standard Authorization header.
  // Browser WebSockets cannot, so they carry the same JWT through a bounded
  // subprotocol. Never fall back from a malformed explicit Authorization
  // header, because that could mask a bad or injected header.
  if (c.req.header("authorization") !== undefined) {
    return authMiddleware(c, next);
  }

  const credentials = parseSyncWebSocketProtocols(
    c.req.header("sec-websocket-protocol"),
  );
  if (!credentials) {
    return c.json({ error: "Missing or invalid sync credentials" }, 401);
  }

  return authenticateAccessToken(c, next, credentials.accessToken, {
    deviceId: credentials.deviceId,
  });
}

syncRouter.use("*", syncAuthMiddleware);

/**
 * WebSocket endpoint for real-time synchronization.
 * Replaces the legacy SSE /events route.
 */
syncRouter.get(
  "/events",
  upgradeWebSocket((c: Context) => {
    const { userId } = c.get("user");
    const deviceId = c.get("deviceId");
    const connId = Math.random().toString(36).substring(2, 11);

    return {
      onOpen(_event: Event, ws: WSContext) {
        // Register connection
        syncService.addConnection(userId, {
          id: connId,
          deviceId,
          ws,
        });

        // Send connection confirmation
        ws.send(JSON.stringify({ event: "ping", data: "connected" }));

        logger.debug({ userId, connId }, "WebSocket connection opened");
      },
      onMessage(event: { data: any }) {
        try {
          const { event: type, data } = JSON.parse(event.data.toString());

          // Handle incoming events (e.g. remote control)
          if (type === "playback_update") {
            // Broadcast to other devices of the same user
            syncService.broadcast(userId, type, data, deviceId);
          }

          logger.debug({ userId, type }, "WebSocket message received");
        } catch (err) {
          logger.error({ userId, err }, "Failed to parse WebSocket message");
        }
      },
      onClose() {
        syncService.removeConnection(userId, connId);
        logger.debug({ userId, connId }, "WebSocket connection closed");
      },
      onError(err: Error | unknown) {
        logger.error({ userId, connId, err }, "WebSocket error");
        syncService.removeConnection(userId, connId);
      },
    };
  }),
);
