import { streamSSE } from "hono/streaming";
import { logger } from "../../config/logger.js";

type SSEStream = {
  id: string;
  deviceId?: string;
  writeSSE: (data: {
    data: string;
    event: string;
    id: string;
  }) => Promise<void>;
};

class SyncService {
  private connections = new Map<string, Set<SSEStream>>();

  /** Register a new SSE connection for a user */
  addConnection(userId: string, stream: SSEStream) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(stream);
    logger.debug(
      { userId, streamId: stream.id, deviceId: stream.deviceId },
      "SSE connection registered",
    );
  }

  /** Remove an SSE connection */
  removeConnection(userId: string, streamId: string) {
    const userConns = this.connections.get(userId);
    if (userConns) {
      for (const conn of userConns) {
        if (conn.id === streamId) {
          userConns.delete(conn);
          break;
        }
      }
      if (userConns.size === 0) {
        this.connections.delete(userId);
      }
    }
    logger.debug({ userId, streamId }, "SSE connection removed");
  }

  /** Send an event to a specific device for a user */
  sendToDevice(userId: string, deviceId: string, event: string, data: any) {
    const userConns = this.connections.get(userId);
    if (!userConns || userConns.size === 0) return;

    const payload = JSON.stringify(data);
    const eventId = Date.now().toString();

    userConns.forEach((conn) => {
      if (conn.deviceId === deviceId) {
        conn.writeSSE({ data: payload, event, id: eventId }).catch((err) => {
          logger.error(
            { userId, deviceId, streamId: conn.id, err },
            "Failed to send targeted SSE event",
          );
        });
      }
    });

    logger.debug(
      { userId, deviceId, event },
      "SSE event sent to specific device",
    );
  }

  /** Broadcast an event to all active connections for a user */
  broadcast(userId: string, event: string, data: any) {
    const userConns = this.connections.get(userId);
    if (!userConns || userConns.size === 0) return;

    const payload = JSON.stringify(data);
    const eventId = Date.now().toString();

    userConns.forEach((conn) => {
      conn.writeSSE({ data: payload, event, id: eventId }).catch((err) => {
        logger.error(
          { userId, streamId: conn.id, err },
          "Failed to send SSE event",
        );
      });
    });

    logger.debug(
      { userId, event, streamCount: userConns.size },
      "SSE event broadcasted",
    );
  }
}

export const syncService = new SyncService();
