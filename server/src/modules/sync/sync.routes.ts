import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { syncService } from "./sync.service.js";
import { logger } from "../../config/logger.js";

export const syncRouter = new Hono<{ Variables: { userId: string } }>();

syncRouter.use("*", authMiddleware);

syncRouter.get("/events", async (c) => {
  const userId = c.get("userId");
  const deviceId = c.req.header("X-Device-Id");
  const streamId = Math.random().toString(36).substring(2, 11);

  return streamSSE(c, async (stream) => {
    // Register connection
    syncService.addConnection(userId, {
      id: streamId,
      deviceId,
      writeSSE: (data) => stream.writeSSE(data),
    });

    // Send initial heart beat / connection confirm
    await stream.writeSSE({
      data: "connected",
      event: "ping",
      id: Date.now().toString(),
    });

    // Keep connection alive / Handle cleanup on disconnect
    stream.onAbort(() => {
      syncService.removeConnection(userId, streamId);
      logger.debug({ userId, streamId }, "SSE connection aborted by client");
    });

    // In Hono, we need to keep the function running or the stream will close.
    // However, stream.onAbort handles the cleanup when the client disconnects.
    // We just need to ensure we don't resolve the promise until the client is gone.
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 30000)); // Heartbeat every 30s
      await stream.writeSSE({
        data: "heartbeat",
        event: "ping",
        id: Date.now().toString(),
      });
    }
  });
});
