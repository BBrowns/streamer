import { z } from 'zod';

export const metaPreviewSchema = z.object({
    id: z.string().min(1),
    type: z.enum(['movie', 'series']),
    name: z.string().min(1),
    poster: z.string().url(),
    description: z.string().optional(),
    releaseInfo: z.string().optional(),
    imdbRating: z.string().optional(),
});

export const videoEntrySchema = z.object({
    id: z.string(),
    title: z.string(),
    season: z.number().int().nonnegative(),
    episode: z.number().int().nonnegative(),
    released: z.string(),
});

export const metaDetailSchema = metaPreviewSchema.extend({
    background: z.string().url().optional(),
    genres: z.array(z.string()).optional(),
    cast: z.array(z.string()).optional(),
    director: z.array(z.string()).optional(),
    runtime: z.string().optional(),
    videos: z.array(videoEntrySchema).optional(),
});

export const catalogResponseSchema = z.object({
    metas: z.array(metaPreviewSchema),
});

export const metaResponseSchema = z.object({
    meta: metaDetailSchema,
});
