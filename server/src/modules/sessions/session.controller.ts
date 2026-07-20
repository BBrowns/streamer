import { Context } from "hono";
import { sessionService } from "./session.service.js";

export const sessionController = {
  /** Get all active sessions for current user */
  getSessions: async (c: Context) => {
    const { userId } = c.get("user");
    const activeSessions = await sessionService.getSessions(userId);
    return c.json({ sessions: activeSessions });
  },

  /** Update current session for this device */
  updateSession: async (c: Context) => {
    const { userId } = c.get("user");
    const deviceId = c.req.header("X-Device-Id") || "unknown";
    const body = await c.req.json();

    await sessionService.updateSession(userId, deviceId, {
      ...body,
      deviceId,
    });
    return c.json({ success: true });
  },

  /** Send a remote command to another device */
  sendCommand: async (c: Context) => {
    const { userId } = c.get("user");
    const { targetDeviceId, action, data } = await c.req.json();

    if (!targetDeviceId || !action) {
      return c.json({ message: "Missing targetDeviceId or action" }, 400);
    }

    sessionService.sendCommand(userId, targetDeviceId, action, data);
    return c.json({ success: true });
  },

  /** Remove current session */
  removeSession: async (c: Context) => {
    const { userId } = c.get("user");
    const deviceId = c.req.header("X-Device-Id") || "unknown";

    await sessionService.removeSession(userId, deviceId);
    return c.json({ success: true });
  },
};
