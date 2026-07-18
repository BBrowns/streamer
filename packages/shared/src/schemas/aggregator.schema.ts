import { z } from "zod";
import { metaPreviewSchema } from "./meta.schema";

export const aggregatorSearchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  type: z.enum(["all", "movie", "series"]).default("all"),
  mode: z.enum(["suggestions", "results"]).default("results"),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional(),
  cursor: z
    .union([
      z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().min(0).max(100_000)),
      z
        .string()
        .min(16)
        .max(512)
        .regex(/^[A-Za-z0-9_-]+$/),
    ])
    .optional(),
});

export const aggregatorSearchResponseSchema = z.object({
  metas: z.array(metaPreviewSchema),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  providersByContent: z.record(z.string(), z.array(z.string())),
  attemptedProviders: z.number().int().nonnegative(),
  successfulProviders: z.number().int().nonnegative(),
  failedProviderIds: z.array(z.string()),
  partial: z.boolean(),
  truncated: z.boolean(),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().optional(),
});

export const aggregatorCatalogSchema = z.object({
  type: z.string().min(1),
  search: z.string().optional(),
  skip: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
});

export const addonCatalogSchema = aggregatorCatalogSchema.extend({
  addonId: z.string().min(1),
  catalogId: z.string().min(1),
});

export const aggregatorMetaSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

export const aggregatorStreamSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

export const aggregatorResolveSchema = aggregatorStreamSchema.extend({
  infoHash: z.string().min(1),
});

export const aggregatorResolveBulkSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1).optional(),
  infoHashes: z.array(z.string()).min(1),
});
