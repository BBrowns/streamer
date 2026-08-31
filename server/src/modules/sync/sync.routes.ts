import { Hono } from "hono";
import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { parseSyncWebSocketProtocols } from "@streamer/shared";
import { upgradeWebSocket } from "../../config/websocket.js";
import {
  authenticateAccessToken,
  authMiddleware,
} from "../../middleware/auth.middleware.js";
import { SessionService } from "../auth/session.service.js";
import { env } from "../../config/env.js";
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
    const authPayload = c.get("user");
    const { userId } = authPayload;
    const sessionId = authPayload.sid || authPayload.jti;
    const deviceId = c.get("deviceId");
    const connId = Math.random().toString(36).substring(2, 11);
    let socket: WSContext | undefined;

    return {
      onOpen(_event: Event, ws: WSContext) {
        socket = ws;
        // Register connection
        const accepted = syncService.addConnection(userId, {
          id: connId,
          deviceId,
          ws,
        });
        if (!accepted) {
          ws.close(1008, "Connection limit reached");
          return;
        }

        // Send connection confirmation
        ws.send(JSON.stringify({ event: "ping", data: "connected" }));

        logger.debug({ userId, connId }, "WebSocket connection opened");
      },
      async onMessage(event: { data: any }) {
        const expired =
          typeof authPayload.exp === "number" &&
          Math.floor(Date.now() / 1000) >= authPayload.exp;
        let revocation: Awaited<
          ReturnType<typeof SessionService.checkAccessToken>
        > = "active";
        try {
          if (!expired && sessionId) {
            revocation = await SessionService.checkAccessToken(
              userId,
              sessionId,
              authPayload.iat,
            );
          }
        } catch {
          revocation = "unavailable";
        }

        if (
          expired ||
          revocation === "revoked" ||
          (env.nodeEnv === "production" && revocation !== "active")
        ) {
          try {
            socket?.close(1008, "Authentication expired or revoked");
          } catch {}
          syncService.removeConnection(userId, connId);
          return;
        }

        const result = syncService.acceptIncomingMessage(
          userId,
          connId,
          event.data,
        );
        if (!result.ok) {
          const closeCode = result.code === "payload_too_large" ? 1009 : 1008;
          try {
            socket?.close(closeCode, "Invalid or excessive WebSocket message");
          } catch {}
          syncService.removeConnection(userId, connId);
          return;
        }

        syncService.broadcast(
          userId,
          result.message.event,
          result.message.data,
          deviceId,
        );
        logger.debug(
          { userId, type: result.message.event },
          "WebSocket message received",
        );
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
