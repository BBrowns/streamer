import { redis } from "../../services/redis.js";
import { syncService } from "../sync/sync.service.js";
import { logger } from "../../config/logger.js";

const PLAYBACK_TTL = 24 * 60 * 60; // 24 hours
const PLAYBACK_PREFIX = "playback:session:";
const USER_PLAYBACK_PREFIX = "playback:user-sessions:";

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
  /** Update or create a playback session for a device in Redis */
  async updateSession(
    userId: string,
    deviceId: string,
    data: Partial<PlaybackSession>,
  ) {
    if (!redis) return;

    const sessionKey = `${PLAYBACK_PREFIX}${userId}:${deviceId}`;
    const userSessionsKey = `${USER_PLAYBACK_PREFIX}${userId}`;

    // Get existing to merge
    const existingData = await redis.get(sessionKey);
    const existing: PlaybackSession = existingData
      ? JSON.parse(existingData)
      : {
          deviceId,
          status: "idle",
          lastUpdate: Date.now(),
        };

    const updated: PlaybackSession = {
      ...existing,
      ...data,
      lastUpdate: Date.now(),
    };

    // Save to Redis and update user's session set
    await redis
      .multi()
      .set(sessionKey, JSON.stringify(updated), "EX", PLAYBACK_TTL)
      .sadd(userSessionsKey, deviceId)
      .expire(userSessionsKey, PLAYBACK_TTL)
      .exec();

    // Notify other devices about the session update
    const allSessions = await this.getSessions(userId);
    syncService.broadcast(userId, "SESSION_UPDATE", {
      sessions: allSessions,
    });

    logger.debug(
      { userId, deviceId, status: updated.status },
      "Playback session updated in Redis",
    );
  }

  /** Get all active playback sessions for a user from Redis */
  async getSessions(userId: string): Promise<PlaybackSession[]> {
    if (!redis) return [];

    const userSessionsKey = `${USER_PLAYBACK_PREFIX}${userId}`;
    const devices = await redis.smembers(userSessionsKey);
    const sessions: PlaybackSession[] = [];

    for (const dId of devices) {
      const data = await redis.get(`${PLAYBACK_PREFIX}${userId}:${dId}`);
      if (data) {
        sessions.push(JSON.parse(data));
      } else {
        await redis.srem(userSessionsKey, dId);
      }
    }

    // Filter out stale sessions (inactive for more than 5 minutes for "broadcast" purposes)
    // But keep them in Redis for 24h as history/resume
    const now = Date.now();
    return sessions.filter((s) => now - s.lastUpdate < 5 * 60 * 1000);
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

  /** Remove a playback session from Redis */
  async removeSession(userId: string, deviceId: string) {
    if (!redis) return;

    const sessionKey = `${PLAYBACK_PREFIX}${userId}:${deviceId}`;
    const userSessionsKey = `${USER_PLAYBACK_PREFIX}${userId}`;

    await redis.multi().del(sessionKey).srem(userSessionsKey, deviceId).exec();

    const allSessions = await this.getSessions(userId);
    syncService.broadcast(userId, "SESSION_UPDATE", {
      sessions: allSessions,
    });
  }
}

export const sessionService = new SessionService();
