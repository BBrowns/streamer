import { Context } from "hono";
import { sessionService } from "./session.service.js";
import { logger } from "../../config/logger.js";

export const sessionController = {
  /** Get all active sessions for current user */
  getSessions: async (c: Context) => {
    const userId = c.get("userId");
    try {
      const activeSessions = sessionService.getSessions(userId);
      return c.json({ sessions: activeSessions });
    } catch (err) {
      logger.error({ userId, err }, "Failed to get sessions");
      return c.json({ message: "Internal server error" }, 500);
    }
  },

  /** Update current session for this device */
  updateSession: async (c: Context) => {
    const userId = c.get("userId");
    const deviceId = c.req.header("X-Device-Id") || "unknown";
    const body = await c.req.json();

    try {
      sessionService.updateSession(userId, deviceId, {
        ...body,
        deviceId,
      });
      return c.json({ success: true });
    } catch (err) {
      logger.error({ userId, deviceId, err }, "Failed to update session");
      return c.json({ message: "Internal server error" }, 500);
    }
  },

  /** Send a remote command to another device */
  sendCommand: async (c: Context) => {
    const userId = c.get("userId");
    const { targetDeviceId, action, data } = await c.req.json();

    if (!targetDeviceId || !action) {
      return c.json({ message: "Missing targetDeviceId or action" }, 400);
    }

    try {
      sessionService.sendCommand(userId, targetDeviceId, action, data);
      return c.json({ success: true });
    } catch (err) {
      logger.error(
        { userId, targetDeviceId, action, err },
        "Failed to send command",
      );
      return c.json({ message: "Internal server error" }, 500);
    }
  },

  /** Remove current session */
  removeSession: async (c: Context) => {
    const userId = c.get("userId");
    const deviceId = c.req.header("X-Device-Id") || "unknown";

    try {
      sessionService.removeSession(userId, deviceId);
      return c.json({ success: true });
    } catch (err) {
      logger.error({ userId, deviceId, err }, "Failed to remove session");
      return c.json({ message: "Internal server error" }, 500);
    }
  },
};
