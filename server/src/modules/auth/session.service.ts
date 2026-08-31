import { redis } from "../../services/redis.js";
import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";
import { NotificationService } from "../notification/notification.service.js";
import { normalizeDeviceId } from "@streamer/shared";

const SESSION_TTL = 60;
const REVOCATION_TTL = 7 * 24 * 60 * 60;
const MAX_SESSION_IDS_PER_USER = 10_000;
const SESSION_PREFIX = "auth:session:";
const USER_SESSIONS_PREFIX = "auth:user-sessions:";
const REVOKED_SESSION_PREFIX = "auth:revoked-session:";
const REVOKED_USER_PREFIX = "auth:revoked-user:";

export interface ActiveSession {
  id: string;
  userId: string;
  deviceId: string;
  ipAddress?: string;
  userAgent?: string;
  lastActivity: Date;
}

export type SessionRevocationStatus =
  "active" | "revoked" | "unavailable" | "not_configured";

function sessionKey(sessionId: string) {
  return `${SESSION_PREFIX}${sessionId}`;
}

function userSessionsKey(userId: string) {
  return `${USER_SESSIONS_PREFIX}${userId}`;
}

function revokedSessionKey(userId: string, sessionId: string) {
  return `${REVOKED_SESSION_PREFIX}${userId}:${sessionId}`;
}

function revokedUserKey(userId: string) {
  return `${REVOKED_USER_PREFIX}${userId}`;
}

function isSession(value: unknown): value is ActiveSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ActiveSession>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.userId === "string" &&
    typeof candidate.deviceId === "string" &&
    candidate.lastActivity instanceof Date &&
    !Number.isNaN(candidate.lastActivity.getTime())
  );
}

async function deleteRefreshTokensForSession(
  userId: string,
  sessionId: string,
) {
  await prisma.refreshToken.deleteMany({ where: { userId, sessionId } });
}

export class SessionService {
  /** Check revocation state on every protected request. */
  static async checkAccessToken(
    userId: string,
    sessionId: string,
    issuedAt?: number,
  ): Promise<SessionRevocationStatus> {
    if (!redis) return "not_configured";

    try {
      const [sessionRevokedAt, userRevokedAt] = await redis.mget(
        revokedSessionKey(userId, sessionId),
        revokedUserKey(userId),
      );
      if (sessionRevokedAt) return "revoked";
      if (
        userRevokedAt &&
        issuedAt &&
        issuedAt <= Number.parseInt(userRevokedAt, 10)
      ) {
        return "revoked";
      }
      return "active";
    } catch (error) {
      logger.warn({ error }, "Session revocation check unavailable");
      return "unavailable";
    }
  }

  /** Register or update an active session with one canonical opaque id. */
  static async heartbeat(
    userId: string,
    deviceId: string,
    sessionId: string,
    ip?: string,
    userAgent?: string,
  ) {
    if (!redis) return 1;

    try {
      const normalizedDeviceId = normalizeDeviceId(deviceId);
      const now = new Date();
      const key = sessionKey(sessionId);
      const sessionsKey = userSessionsKey(userId);
      const exists = await redis.exists(key);

      if (!exists) {
        NotificationService.createNotification(
          userId,
          "New Device Login",
          "A new device just signed into your account.",
        ).catch((error) =>
          logger.error({ error }, "Failed to create new login notification"),
        );
      }

      const sessionData = {
        id: sessionId,
        userId,
        deviceId: normalizedDeviceId,
        ...(ip ? { ipAddress: ip } : {}),
        ...(userAgent ? { userAgent: userAgent.slice(0, 512) } : {}),
        lastActivity: now.toISOString(),
      };

      await redis
        .multi()
        .set(key, JSON.stringify(sessionData), "EX", SESSION_TTL)
        .sadd(sessionsKey, sessionId)
        .expire(sessionsKey, SESSION_TTL * 2)
        .exec();

      const sessionIds = await redis.smembers(sessionsKey);
      const activeIds: string[] = [];
      for (const candidateId of sessionIds.slice(0, MAX_SESSION_IDS_PER_USER)) {
        if (await redis.exists(sessionKey(candidateId))) {
          activeIds.push(candidateId);
        } else {
          await redis.srem(sessionsKey, candidateId);
        }
      }

      if (sessionIds.length > MAX_SESSION_IDS_PER_USER) {
        const excess = sessionIds.length - MAX_SESSION_IDS_PER_USER;
        const evicted = await redis.srandmember(sessionsKey, excess);
        if (evicted.length > 0) {
          await redis.srem(sessionsKey, ...evicted);
        }
      }

      return activeIds.length;
    } catch (error) {
      logger.error({ userId, sessionId, error }, "Session heartbeat failed");
      return 1;
    }
  }

  static async getActiveSessions(userId: string): Promise<ActiveSession[]> {
    if (!redis) return [];

    const sessionsKey = userSessionsKey(userId);
    const ids = (await redis.smembers(sessionsKey)).slice(
      0,
      MAX_SESSION_IDS_PER_USER,
    );
    const sessions: ActiveSession[] = [];

    for (const id of ids) {
      const raw = await redis.get(sessionKey(id));
      if (!raw) {
        await redis.srem(sessionsKey, id);
        continue;
      }

      try {
        const parsed = JSON.parse(raw) as Partial<ActiveSession>;
        const candidate = {
          ...parsed,
          lastActivity: new Date(parsed.lastActivity as unknown as string),
        };
        if (isSession(candidate) && candidate.userId === userId) {
          sessions.push(candidate);
        } else {
          await redis.srem(sessionsKey, id);
        }
      } catch {
        await redis.srem(sessionsKey, id);
      }
    }

    return sessions.sort(
      (left, right) =>
        right.lastActivity.getTime() - left.lastActivity.getTime(),
    );
  }

  /** Revoke one session immediately and invalidate its refresh-token family. */
  static async revoke(userId: string, sessionId: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return;

    if (redis) {
      // Keep the revocation marker independent of the short-lived active
      // session record. A user may revoke a session after its activity
      // metadata has expired, while the JWT is still within its lifetime.
      // Scoping the marker by user prevents a leaked id from affecting a
      // different user's session namespace.
      await redis
        .multi()
        .set(revokedSessionKey(userId, sessionId), "1", "EX", REVOCATION_TTL)
        .del(sessionKey(sessionId))
        .srem(userSessionsKey(userId), sessionId)
        .exec();
    }

    await deleteRefreshTokensForSession(userId, sessionId);
    logger.info({ userId }, "Session revoked");
  }

  /** Revoke every session and refresh token after a password/security event. */
  static async revokeAll(userId: string): Promise<void> {
    if (redis) {
      const sessionsKey = userSessionsKey(userId);
      const ids = await redis.smembers(sessionsKey);
      const transaction = redis
        .multi()
        .set(
          revokedUserKey(userId),
          String(Math.floor(Date.now() / 1000)),
          "EX",
          REVOCATION_TTL,
        );
      for (const id of ids.slice(0, MAX_SESSION_IDS_PER_USER)) {
        transaction.del(sessionKey(id));
      }
      transaction.del(sessionsKey);
      await transaction.exec();
    }

    await prisma.refreshToken.deleteMany({ where: { userId } });
    logger.info({ userId }, "All sessions revoked");
  }
}
