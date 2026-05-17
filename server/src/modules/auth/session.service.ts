import { redis } from "../../services/redis.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middleware/error.middleware.js";
import { NotificationService } from "../notification/notification.service.js";

const SESSION_TTL = 60; // 60 seconds TTL for heartbeats
const SESSION_PREFIX = "auth:session:";
const USER_SESSIONS_PREFIX = "auth:user-sessions:";

export interface ActiveSession {
  id: string;
  userId: string;
  deviceId: string;
  ipAddress?: string;
  userAgent?: string;
  lastActivity: Date;
}

export class SessionService {
  /**
   * Register or update an active session for a user + device in Redis.
   */
  static async heartbeat(
    userId: string,
    deviceId: string,
    ip?: string,
    userAgent?: string,
  ) {
    try {
      const now = new Date();
      const sessionKey = `${SESSION_PREFIX}${userId}:${deviceId}`;
      const userSessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;

      if (!redis) {
        // Fallback or skip if Redis is missing (not ideal but avoids crash)
        return 1;
      }

      // Check if this is a new session for notification
      const exists = await redis.exists(sessionKey);
      if (!exists) {
        NotificationService.createNotification(
          userId,
          "New Device Login",
          `A new device just signed into your account. IP: ${ip || "Unknown"}`,
        ).catch((err) =>
          logger.error(
            { err: err.message },
            "Failed to create new login notification",
          ),
        );
      }

      const sessionData: ActiveSession = {
        id: `${userId}:${deviceId}`,
        userId,
        deviceId,
        ipAddress: ip,
        userAgent: userAgent,
        lastActivity: now,
      };

      // Atomic update: Set session data and add to user's device set
      await redis
        .multi()
        .set(sessionKey, JSON.stringify(sessionData), "EX", SESSION_TTL)
        .sadd(userSessionsKey, deviceId)
        .expire(userSessionsKey, SESSION_TTL * 2) // User map expires if no heartbeats for a while
        .exec();

      // Get count of active sessions for this user
      // We need to clean up the set if some sessions expired
      const devices = await redis.smembers(userSessionsKey);
      const activeDevices: string[] = [];

      for (const dId of devices) {
        const dExists = await redis.exists(`${SESSION_PREFIX}${userId}:${dId}`);
        if (dExists) {
          activeDevices.push(dId);
        } else {
          // Clean up individual expired session from the set
          await redis.srem(userSessionsKey, dId);
        }
      }

      return activeDevices.length;
    } catch (err: any) {
      logger.error(
        { userId, deviceId, err: err.message },
        "Failed to update session heartbeat in Redis",
      );
      return 1;
    }
  }

  static async getActiveSessions(userId: string): Promise<ActiveSession[]> {
    if (!redis) return [];

    const userSessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;
    const devices = await redis.smembers(userSessionsKey);
    const sessions: ActiveSession[] = [];

    for (const dId of devices) {
      const data = await redis.get(`${SESSION_PREFIX}${userId}:${dId}`);
      if (data) {
        sessions.push(JSON.parse(data));
      } else {
        await redis.srem(userSessionsKey, dId);
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
    );
  }

  /** Revoke a specific session from Redis. */
  static async revoke(userId: string, deviceId: string): Promise<void> {
    if (!redis) return;

    const sessionKey = `${SESSION_PREFIX}${userId}:${deviceId}`;
    const userSessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;

    await redis.multi().del(sessionKey).srem(userSessionsKey, deviceId).exec();

    logger.info({ userId, deviceId }, "Session revoked from Redis");
  }
}
