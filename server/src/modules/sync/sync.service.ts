import { logger } from "../../config/logger.js";
import type { WSContext } from "hono/ws";
import {
  SECURITY_LIMITS,
  SYNC_WEBSOCKET_MAX_PAYLOAD_BYTES,
  syncWebSocketMessageSchema,
} from "@streamer/shared";

type WebSocketConnection = {
  id: string;
  deviceId?: string;
  ws: WSContext;
  lastActivityAt: number;
  messageTimestamps: number[];
};

type IncomingMessageResult =
  | {
      ok: true;
      message: { event: "playback_update"; data: Record<string, unknown> };
    }
  | {
      ok: false;
      code: "payload_too_large" | "rate_limited" | "invalid_message";
    };

class SyncService {
  private connections = new Map<string, Set<WebSocketConnection>>();
  private userMessageTimestamps = new Map<string, number[]>();

  constructor() {
    const idleSweep = setInterval(() => this.closeIdleConnections(), 30_000);
    idleSweep.unref?.();
  }

  /** Register a new WebSocket connection for a user, within the per-user cap. */
  addConnection(
    userId: string,
    input: Omit<WebSocketConnection, "lastActivityAt" | "messageTimestamps">,
  ) {
    if (
      !this.connections.has(userId) &&
      this.connections.size >= SECURITY_LIMITS.boundedMapEntries
    ) {
      return false;
    }
    const userConnections = this.connections.get(userId) ?? new Set();
    if (
      userConnections.size >= SECURITY_LIMITS.syncWebSocketConnectionsPerUser
    ) {
      return false;
    }

    const connection: WebSocketConnection = {
      ...input,
      lastActivityAt: Date.now(),
      messageTimestamps: [],
    };
    userConnections.add(connection);
    this.connections.set(userId, userConnections);
    logger.debug(
      { userId, connId: connection.id, deviceId: connection.deviceId },
      "WebSocket connection registered",
    );
    return true;
  }

  /** Validate and account for one incoming frame before application handling. */
  acceptIncomingMessage(
    userId: string,
    connId: string,
    raw: unknown,
  ): IncomingMessageResult {
    const connection = this.findConnection(userId, connId);
    if (!connection) return { ok: false, code: "invalid_message" };

    const text =
      typeof raw === "string"
        ? raw
        : Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : "";
    if (Buffer.byteLength(text, "utf8") > SYNC_WEBSOCKET_MAX_PAYLOAD_BYTES) {
      return { ok: false, code: "payload_too_large" };
    }

    const now = Date.now();
    connection.lastActivityAt = now;
    connection.messageTimestamps = connection.messageTimestamps.filter(
      (timestamp) => now - timestamp < 60_000,
    );
    const userTimestamps = (
      this.userMessageTimestamps.get(userId) ?? []
    ).filter((timestamp) => now - timestamp < 60_000);
    if (
      connection.messageTimestamps.length >=
        SECURITY_LIMITS.syncWebSocketMessagesPerMinute ||
      userTimestamps.length >= SECURITY_LIMITS.syncWebSocketMessagesPerMinute
    ) {
      this.userMessageTimestamps.set(userId, userTimestamps);
      return { ok: false, code: "rate_limited" };
    }
    connection.messageTimestamps.push(now);
    userTimestamps.push(now);
    this.userMessageTimestamps.set(userId, userTimestamps);

    try {
      const parsed = syncWebSocketMessageSchema.parse(JSON.parse(text));
      return { ok: true, message: parsed };
    } catch {
      return { ok: false, code: "invalid_message" };
    }
  }

  /** Remove a WebSocket connection. */
  removeConnection(userId: string, connId: string) {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;
    for (const connection of userConnections) {
      if (connection.id === connId) {
        userConnections.delete(connection);
        break;
      }
    }
    if (userConnections.size === 0) {
      this.connections.delete(userId);
      this.userMessageTimestamps.delete(userId);
    }
    logger.debug({ userId, connId }, "WebSocket connection removed");
  }

  /** Send an event to a specific device for a user. */
  sendToDevice(userId: string, deviceId: string, event: string, data: any) {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.size === 0) return;
    const payload = JSON.stringify({ event, data });

    userConnections.forEach((connection) => {
      if (connection.deviceId !== deviceId) return;
      this.send(connection, userId, payload);
    });
    logger.debug({ userId, deviceId, event }, "WebSocket message sent");
  }

  /** Broadcast an event to all active connections for a user. */
  broadcast(userId: string, event: string, data: any, skipDeviceId?: string) {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.size === 0) return;
    const payload = JSON.stringify({ event, data });

    userConnections.forEach((connection) => {
      if (skipDeviceId && connection.deviceId === skipDeviceId) return;
      this.send(connection, userId, payload);
    });
    logger.debug(
      { userId, event, connCount: userConnections.size },
      "WebSocket message broadcasted",
    );
  }

  private findConnection(userId: string, connId: string) {
    for (const connection of this.connections.get(userId) ?? []) {
      if (connection.id === connId) return connection;
    }
    return undefined;
  }

  private send(
    connection: WebSocketConnection,
    userId: string,
    payload: string,
  ) {
    if (Buffer.byteLength(payload, "utf8") > SYNC_WEBSOCKET_MAX_PAYLOAD_BYTES) {
      try {
        connection.ws.close(1009, "Message too large");
      } catch {}
      this.removeConnection(userId, connection.id);
      return;
    }

    const raw = (connection.ws as any).raw;
    if (
      raw &&
      Number(raw.bufferedAmount) > SYNC_WEBSOCKET_MAX_PAYLOAD_BYTES * 4
    ) {
      try {
        connection.ws.close(1013, "Backpressure limit reached");
      } catch {}
      this.removeConnection(userId, connection.id);
      return;
    }

    try {
      connection.ws.send(payload);
    } catch (error) {
      logger.warn(
        { userId, connId: connection.id, error },
        "WebSocket send failed",
      );
      this.removeConnection(userId, connection.id);
    }
  }

  private closeIdleConnections() {
    const cutoff = Date.now() - SECURITY_LIMITS.syncWebSocketIdleMs;
    for (const [userId, connections] of this.connections) {
      for (const connection of connections) {
        if (connection.lastActivityAt >= cutoff) continue;
        try {
          connection.ws.close(1000, "Idle connection");
        } catch {}
        this.removeConnection(userId, connection.id);
      }
    }
  }
}

export const syncService = new SyncService();
