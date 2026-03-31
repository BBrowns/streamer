import { syncService } from "../sync/sync.service.js";
import { logger } from "../../config/logger.js";

export interface PlaybackSession {
  deviceId: string;
  deviceName?: string;
  itemId?: string;
  itemTitle?: string;
  status: "playing" | "paused" | "idle";
  position?: number;
  duration?: number;
  lastUpdate: number;
}

class SessionService {
  // In-memory store for active sessions (userId -> Map<deviceId, session>)
  private sessions = new Map<string, Map<string, PlaybackSession>>();

  /** Update or create a playback session for a device */
  updateSession(
    userId: string,
    deviceId: string,
    data: Partial<PlaybackSession>,
  ) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new Map());
    }

    const userSessions = this.sessions.get(userId)!;
    const existing = userSessions.get(deviceId) || {
      deviceId,
      status: "idle",
      lastUpdate: Date.now(),
    };

    const updated: PlaybackSession = {
      ...existing,
      ...data,
      lastUpdate: Date.now(),
    };

    userSessions.set(deviceId, updated);

    // Notify other devices about the session update
    syncService.broadcast(userId, "SESSION_UPDATE", {
      sessions: Array.from(userSessions.values()),
    });

    logger.debug(
      { userId, deviceId, status: updated.status },
      "Playback session updated",
    );
  }

  /** Get all active sessions for a user */
  getSessions(userId: string): PlaybackSession[] {
    const userSessions = this.sessions.get(userId);
    if (!userSessions) return [];

    // Filter out stale sessions (inactive for more than 5 minutes)
    const now = Date.now();
    const active = Array.from(userSessions.values()).filter(
      (s) => now - s.lastUpdate < 5 * 60 * 1000,
    );

    return active;
  }

  /** Send a remote command to a specific device */
  sendCommand(
    userId: string,
    targetDeviceId: string,
    action: string,
    data?: any,
  ) {
    logger.info({ userId, targetDeviceId, action }, "Sending remote command");

    syncService.sendToDevice(userId, targetDeviceId, "REMOTE_COMMAND", {
      action,
      data,
      timestamp: Date.now(),
    });
  }

  /** Remove a session (e.g. on logout or app close) */
  removeSession(userId: string, deviceId: string) {
    const userSessions = this.sessions.get(userId);
    if (userSessions) {
      userSessions.delete(deviceId);

      syncService.broadcast(userId, "SESSION_UPDATE", {
        sessions: Array.from(userSessions.values()),
      });
    }
  }
}

export const sessionService = new SessionService();
