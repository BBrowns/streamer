import { z } from "zod";

export const inAppNotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  message: z.string().trim().min(1).max(2_000),
  read: z.boolean(),
  createdAt: z.string().datetime(),
});

export const notificationsResponseSchema = z.object({
  notifications: z.array(inAppNotificationSchema).max(50),
});

export const markAllNotificationsReadResponseSchema = z.object({
  status: z.literal("success"),
  updatedCount: z.number().int().nonnegative(),
});

/** Payload accepted when a signed-in client creates its own notification. */
export const createNotificationSchema = z.object({
  title: z.string().trim().min(1).max(180),
  message: z.string().trim().min(1).max(2_000),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
});
