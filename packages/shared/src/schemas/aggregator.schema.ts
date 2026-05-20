import { z } from "zod";

export const aggregatorSearchSchema = z.object({
  q: z.string().min(1),
});

export const aggregatorCatalogSchema = z.object({
  type: z.string().min(1),
  search: z.string().optional(),
  skip: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
});

export const aggregatorMetaSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

export const aggregatorStreamSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

export const aggregatorResolveBulkSchema = z.object({
  type: z.string().min(1),
  infoHashes: z.array(z.string()).min(1),
});
