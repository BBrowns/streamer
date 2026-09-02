import { z } from "zod";

const playbackUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_192)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return (
        protocol === "https:" || protocol === "http:" || protocol === "magnet:"
      );
    } catch {
      return false;
    }
  }, "Playback URL must use a supported runtime protocol");

const externalNavigationUrlSchema = z
  .string()
  .trim()
  .max(8_192)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" && !parsed.username && !parsed.password
      );
    } catch {
      return false;
    }
  }, "External URLs must use HTTPS without credentials");

export const streamSchema = z.object({
  url: playbackUrlSchema.optional(),
  infoHash: z.string().optional(),
  // Some add-ons use null to mean that no concrete file was selected yet.
  // Normalize that protocol-compatible representation to the optional field
  // used by the rest of the application.
  fileIdx: z.preprocess(
    (value) => (value === null ? undefined : value),
    z.number().int().nonnegative().optional(),
  ),
  fileSelectionHints: z
    .object({
      season: z.number().int().positive().optional(),
      episode: z.number().int().positive().optional(),
      title: z.string().optional(),
    })
    .optional(),
  ytId: z.string().optional(),
  externalUrl: externalNavigationUrlSchema.optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  id: z.string().optional(),
  behaviorHints: z
    .object({
      notWebReady: z.boolean().optional(),
      bingeGroup: z.string().optional(),
      remuxToMp4: z.boolean().optional(),
      remuxStrategy: z
        .enum(["progressive-fmp4", "seekable-cache", "hls"])
        .optional(),
    })
    .optional(),
  resolution: z.string().optional(),
  seeders: z.number().optional(),
});

export const streamResponseSchema = z.object({
  streams: z.array(streamSchema),
});
