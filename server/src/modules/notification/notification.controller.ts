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
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Notification ID required" }, 400);

    const notification = await NotificationService.markAsRead(user.userId, id);
    return c.json({ status: "success", notification });
  }
}

export const notificationController = new NotificationController();
