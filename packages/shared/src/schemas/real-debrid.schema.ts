import { z } from "zod";

export const realDebridStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  isPremium: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const realDebridDeviceFlowSchema = z.object({
  flowId: z.string().uuid(),
  userCode: z.string().min(1).max(64),
  verificationUrl: z
    .string()
    .url()
    .refine(
      (value) => new URL(value).protocol === "https:",
      "Real-Debrid verification must use HTTPS",
    ),
  expiresAt: z.string().datetime(),
  intervalSeconds: z.number().int().min(1).max(60),
});

export const realDebridDevicePollSchema = z.object({
  status: z.enum(["pending", "expired", "connected"]),
  retryAfterSeconds: z.number().int().min(1).max(60).optional(),
  expiresAt: z.string().datetime().optional(),
});
