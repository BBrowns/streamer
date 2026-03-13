import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";

export class SessionService {
  /**
   * Register or update an active session for a user + device.
   * Also returns the total number of active sessions for this user.
   */
  static async heartbeat(
    userId: string,
    deviceId: string,
    ip?: string,
    userAgent?: string,
  ) {
    try {
      const now = new Date();

      // UPSERT the session
      await prisma.activeSession.upsert({
        where: {
          userId_deviceId: { userId, deviceId },
        },
        update: {
          lastActivity: now,
          ipAddress: ip,
          userAgent: userAgent,
        },
        create: {
          userId,
          deviceId,
          ipAddress: ip,
          userAgent: userAgent,
          lastActivity: now,
        },
      });

      // Cleanup stale sessions (older than 30 seconds)
      const STALE_THRESHOLD = new Date(Date.now() - 30 * 1000);
      await prisma.activeSession.deleteMany({
        where: {
          userId,
          lastActivity: { lt: STALE_THRESHOLD },
        },
      });

      // Count remaining active sessions
      const sessionCount = await prisma.activeSession.count({
        where: { userId },
      });

      return sessionCount;
    } catch (err: any) {
      logger.error(
        { userId, deviceId, err: err.message },
        "Failed to update session heartbeat",
      );
      return 1; // Fallback to 1 to avoid blocking user on DB failure
    }
  }

  static async getActiveSessions(userId: string) {
    return prisma.activeSession.findMany({
      where: { userId },
      orderBy: { lastActivity: "desc" },
    });
  }
}
