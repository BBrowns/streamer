import type { Context } from "hono";
import { NotificationService } from "./notification.service.js";

export class NotificationController {
  async getNotifications(c: Context) {
    const user = c.get("user");
    const notifications = await NotificationService.getNotifications(
      user.userId,
    );
    return c.json({ notifications });
  }

  async markAsRead(c: Context) {
    const user = c.get("user");
    const { id } = (c.req as any).valid("param");

    const notification = await NotificationService.markAsRead(user.userId, id);
    return c.json({ status: "success", notification });
  }

  async markAllAsRead(c: Context) {
    const user = c.get("user");
    const updatedCount = await NotificationService.markAllAsRead(user.userId);
    return c.json({ status: "success", updatedCount });
  }

  async createNotification(c: Context) {
    const user = c.get("user");
    const { title, message } = (c.req as any).valid("json");

    const notification = await NotificationService.createNotification(
      user.userId,
      title,
      message,
    );

    return c.json({ status: "success", notification }, 201);
  }
}

export const notificationController = new NotificationController();
