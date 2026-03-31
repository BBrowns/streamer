import { Hono } from "hono";
import { notificationController } from "./notification.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";

export const notificationRouter = new Hono();

notificationRouter.use("/*", authMiddleware);
notificationRouter.get("/", (c) => notificationController.getNotifications(c));
notificationRouter.patch("/:id/read", (c) =>
  notificationController.markAsRead(c),
);
notificationRouter.post("/", (c) =>
  notificationController.createNotification(c),
);
