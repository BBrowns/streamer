import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createNotificationSchema,
  notificationIdParamSchema,
} from "@streamer/shared";
import { notificationController } from "./notification.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import type { HonoEnv } from "../../types/hono.js";

export const notificationRouter = new Hono<HonoEnv>();

notificationRouter.use("/*", authMiddleware);
notificationRouter.get("/", (c) => notificationController.getNotifications(c));
notificationRouter.patch("/read-all", (c) =>
  notificationController.markAllAsRead(c),
);
notificationRouter.patch(
  "/:id/read",
  zValidator("param", notificationIdParamSchema),
  (c) => notificationController.markAsRead(c),
);
notificationRouter.post(
  "/",
  zValidator("json", createNotificationSchema),
  (c) => notificationController.createNotification(c),
);
