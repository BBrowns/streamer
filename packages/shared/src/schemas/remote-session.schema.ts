import { z } from "zod";

const MAX_PLAYBACK_SECONDS = 7 * 24 * 60 * 60;

export const playbackControlStatusSchema = z.enum([
  "playing",
  "paused",
  "idle",
]);

export const boundedDeviceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const boundedCommandValueSchema = z.union([
  z.string().max(512),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const playbackSessionUpdateSchema = z
  .object({
    deviceName: z.string().trim().max(128).optional(),
    itemId: z.string().trim().min(1).max(256).optional(),
    itemTitle: z.string().trim().max(512).optional(),
    status: playbackControlStatusSchema.optional(),
    position: z
      .number()
      .finite()
      .nonnegative()
      .max(MAX_PLAYBACK_SECONDS)
      .optional(),
    duration: z
      .number()
      .finite()
      .nonnegative()
      .max(MAX_PLAYBACK_SECONDS)
      .optional(),
  })
  .strict();

export const remotePlaybackSessionSchema = playbackSessionUpdateSchema
  .extend({
    deviceId: boundedDeviceIdSchema,
    status: playbackControlStatusSchema,
    lastUpdate: z.number().int().nonnegative(),
  })
  .strict();

export const remoteSessionCommandSchema = z
  .object({
    targetDeviceId: boundedDeviceIdSchema,
    action: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_.:-]+$/),
    data: z
      .record(z.string().max(64), boundedCommandValueSchema)
      .superRefine((value, context) => {
        if (Object.keys(value).length > 16) {
          context.addIssue({
            code: "custom",
            message: "Too many command fields",
          });
        }
      })
      .optional(),
  })
  .strict();
