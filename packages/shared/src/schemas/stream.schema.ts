import { z } from "zod";

export const streamSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  name: z.string().optional(),
  behaviorHints: z
    .object({
      notWebReady: z.boolean().optional(),
      bingeGroup: z.string().optional(),
    })
    .optional(),
});

export const streamResponseSchema = z.object({
  streams: z.array(streamSchema),
});
