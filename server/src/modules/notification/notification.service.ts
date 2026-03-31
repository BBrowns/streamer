import { prisma } from "../../prisma/client.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../middleware/error.middleware.js";

export class NotificationService {
  static async createNotification(
    userId: string,
    title: string,
    message: string,
  ) {
    const notification = await prisma.notification.create({
      data: { userId, title, message },
    });
    logger.info(
      { userId, notificationId: notification.id },
      "Notification created",
    );
    return notification;
  }

  static async getNotifications(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50, // Limit to recent
    });
  }

  static async markAsRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new AppError(404, "Notification not found");
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }
}
