import { logger } from "../../config/logger.js";
import type { WSContext } from "hono/ws";

type WebSocketConnection = {
  id: string;
  deviceId?: string;
  ws: WSContext;
};

class SyncService {
  private connections = new Map<string, Set<WebSocketConnection>>();

  /** Register a new WebSocket connection for a user */
  addConnection(userId: string, conn: WebSocketConnection) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(conn);
    logger.debug(
      { userId, connId: conn.id, deviceId: conn.deviceId },
      "WebSocket connection registered",
    );
  }

  /** Remove a WebSocket connection */
  removeConnection(userId: string, connId: string) {
    const userConns = this.connections.get(userId);
    if (userConns) {
      for (const conn of userConns) {
        if (conn.id === connId) {
          userConns.delete(conn);
          break;
        }
      }
      if (userConns.size === 0) {
        this.connections.delete(userId);
      }
    }
    logger.debug({ userId, connId }, "WebSocket connection removed");
  }

  /** Send an event to a specific device for a user */
  sendToDevice(userId: string, deviceId: string, event: string, data: any) {
    const userConns = this.connections.get(userId);
    if (!userConns || userConns.size === 0) return;

    const payload = JSON.stringify({ event, data });

    userConns.forEach((conn) => {
      if (conn.deviceId === deviceId) {
        try {
          conn.ws.send(payload);
        } catch (err) {
          logger.error(
            { userId, deviceId, connId: conn.id, err },
            "Failed to send targeted WebSocket message",
          );
        }
      }
    });

    logger.debug(
      { userId, deviceId, event },
      "WebSocket message sent to specific device",
    );
  }

  /** Broadcast an event to all active connections for a user */
  broadcast(userId: string, event: string, data: any, skipDeviceId?: string) {
    const userConns = this.connections.get(userId);
    if (!userConns || userConns.size === 0) return;

    const payload = JSON.stringify({ event, data });

    userConns.forEach((conn) => {
      if (skipDeviceId && conn.deviceId === skipDeviceId) return;

      try {
        conn.ws.send(payload);
      } catch (err) {
        logger.error(
          { userId, connId: conn.id, err },
          "Failed to send WebSocket message",
        );
      }
    });

    logger.debug(
      { userId, event, connCount: userConns.size },
      "WebSocket message broadcasted",
    );
  }
}

export const syncService = new SyncService();
