import { redis } from "../../services/redis.js";
import { syncService } from "../sync/sync.service.js";
import { logger } from "../../config/logger.js";
import {
  boundedDeviceIdSchema,
  remotePlaybackSessionSchema,
  playbackSessionUpdateSchema,
  remoteSessionCommandSchema,
  SECURITY_LIMITS,
} from "@streamer/shared";

const PLAYBACK_TTL = 24 * 60 * 60; // 24 hours
const PLAYBACK_PREFIX = "playback:session:";
const USER_PLAYBACK_PREFIX = "playback:user-sessions:";
const MAX_PLAYBACK_SESSIONS_PER_USER = SECURITY_LIMITS.boundedMapEntries;
const STALE_SESSION_BROADCAST_MS = 5 * 60 * 1000;

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

    const normalizedDeviceId = boundedDeviceIdSchema.parse(deviceId);
    const parsedData = playbackSessionUpdateSchema.parse(data);
    const sessionKey = `${PLAYBACK_PREFIX}${userId}:${normalizedDeviceId}`;
    const userSessionsKey = `${USER_PLAYBACK_PREFIX}${userId}`;

    // Get existing to merge
    const existingData = await redis.get(sessionKey);
    let existing: PlaybackSession = {
      deviceId: normalizedDeviceId,
      status: "idle",
      lastUpdate: Date.now(),
    };
    if (existingData) {
      try {
        const parsed = remotePlaybackSessionSchema.parse(
          JSON.parse(existingData),
        );
        if (parsed.deviceId === normalizedDeviceId) existing = parsed;
      } catch {
        await redis.srem(userSessionsKey, normalizedDeviceId);
      }
    } else if (
      (await redis.scard(userSessionsKey)) >= MAX_PLAYBACK_SESSIONS_PER_USER
    ) {
      logger.warn({ userId }, "Playback session limit reached");
      return;
    }

    const updated: PlaybackSession = {
      ...existing,
      ...parsedData,
      deviceId: normalizedDeviceId,
      lastUpdate: Date.now(),
    };

    // Save to Redis and update user's session set
    await redis
      .multi()
      .set(sessionKey, JSON.stringify(updated), "EX", PLAYBACK_TTL)
      .sadd(userSessionsKey, normalizedDeviceId)
      .expire(userSessionsKey, PLAYBACK_TTL)
      .exec();

    // Notify other devices about the session update
    const allSessions = await this.getSessions(userId);
    syncService.broadcast(userId, "SESSION_UPDATE", {
      sessions: allSessions,
    });

    logger.debug(
      { userId, deviceId: normalizedDeviceId, status: updated.status },
      "Playback session updated in Redis",
    );
  }

  /** Get all active playback sessions for a user from Redis */
  async getSessions(userId: string): Promise<PlaybackSession[]> {
    if (!redis) return [];

    const userSessionsKey = `${USER_PLAYBACK_PREFIX}${userId}`;
    const devices = (await redis.smembers(userSessionsKey)).slice(
      0,
      MAX_PLAYBACK_SESSIONS_PER_USER,
    );
    const sessions: PlaybackSession[] = [];

    for (const dId of devices) {
      const data = await redis.get(`${PLAYBACK_PREFIX}${userId}:${dId}`);
      if (data) {
        try {
          const parsed = remotePlaybackSessionSchema.parse(JSON.parse(data));
          if (parsed.deviceId === dId) sessions.push(parsed);
          else await redis.srem(userSessionsKey, dId);
        } catch {
          await redis.srem(userSessionsKey, dId);
        }
      } else {
        await redis.srem(userSessionsKey, dId);
      }
    }

    // Filter out stale sessions (inactive for more than 5 minutes for "broadcast" purposes)
    // But keep them in Redis for 24h as history/resume
    const now = Date.now();
    return sessions.filter(
      (s) => now - s.lastUpdate < STALE_SESSION_BROADCAST_MS,
    );
  }

  /** Send a remote command to a specific device */
  sendCommand(
    userId: string,
    targetDeviceId: string,
    action: string,
    data?: any,
  ) {
    const command = remoteSessionCommandSchema.parse({
      targetDeviceId,
      action,
      ...(data === undefined ? {} : { data }),
    });
    logger.info(
      {
        userId,
        targetDeviceId: command.targetDeviceId,
        action: command.action,
      },
      "Sending remote command",
    );

    syncService.sendToDevice(userId, command.targetDeviceId, "REMOTE_COMMAND", {
      action: command.action,
      data: command.data,
      timestamp: Date.now(),
    });
  }

  /** Remove a playback session from Redis */
  async removeSession(userId: string, deviceId: string) {
    if (!redis) return;

    const normalizedDeviceId = boundedDeviceIdSchema.parse(deviceId);
    const sessionKey = `${PLAYBACK_PREFIX}${userId}:${normalizedDeviceId}`;
    const userSessionsKey = `${USER_PLAYBACK_PREFIX}${userId}`;

    await redis
      .multi()
      .del(sessionKey)
      .srem(userSessionsKey, normalizedDeviceId)
      .exec();

    const allSessions = await this.getSessions(userId);
    syncService.broadcast(userId, "SESSION_UPDATE", {
      sessions: allSessions,
    });
  }
}

export const sessionService = new SessionService();
