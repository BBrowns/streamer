import { z } from "zod";
const optionalStringFromPrimitive = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) =>
    value === undefined || value === null ? undefined : String(value),
  );

const optionalStringArray = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  });

export const metaPreviewSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["movie", "series"]),
  name: z.string().min(1),
  poster: z
    .string()
    .nullish()
    .transform((value) => value ?? ""),
  description: z.string().optional(),
  releaseInfo: optionalStringFromPrimitive,
  released: z.string().optional(),
  imdbRating: optionalStringFromPrimitive,
});
export const videoEntrySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    name: z.string().optional(),
    season: z.coerce.number().int().nonnegative().optional(),
    episode: z.coerce.number().int().nonnegative().optional(),
    number: z.coerce.number().int().nonnegative().optional(),
    released: z.string().optional(),
  })
  .transform((video) => {
    const resolvedEpisode = video.episode ?? video.number ?? 0;
    const fallbackTitle =
      resolvedEpisode > 0 ? `Episode ${resolvedEpisode}` : "Episode";

    return {
      id: video.id,
      title: video.title ?? video.name ?? fallbackTitle,
      season: video.season ?? 0,
      episode: resolvedEpisode,
      released: video.released,
    };
  });

export const metaDetailSchema = metaPreviewSchema.extend({
  background: z.string().optional(),
  genres: optionalStringArray,
  cast: optionalStringArray,
  director: optionalStringArray,
  runtime: optionalStringFromPrimitive,
  videos: z.array(videoEntrySchema).optional(),
});

export const catalogResponseSchema = z.object({
  metas: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(metaPreviewSchema),
  ),
});

export const metaResponseSchema = z.object({
  meta: metaDetailSchema,
});
