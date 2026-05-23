import { z } from "zod";

export const streamSchema = z.object({
  url: z.string().url().optional(),
  infoHash: z.string().optional(),
  ytId: z.string().optional(),
  externalUrl: z.string().url().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  behaviorHints: z
    .object({
      notWebReady: z.boolean().optional(),
      bingeGroup: z.string().optional(),
    })
    .optional(),
  resolution: z.string().optional(),
  seeders: z.number().optional(),
});

export const streamResponseSchema = z.object({
  streams: z.array(streamSchema),
});
