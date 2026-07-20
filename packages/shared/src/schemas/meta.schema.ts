import { z } from "zod";

/**
 * Stremio providers commonly serialize an omitted metadata field as `null`
 * rather than leaving it out. Keep the public contract optional while still
 * rejecting non-string values for optional text fields.
 */
const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

const optionalStringFromPrimitive = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) =>
    value === undefined || value === null ? undefined : String(value),
  );

const optionalStringArray = z
  .union([z.array(z.string()), z.string()])
  .nullish()
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
  description: optionalString,
  releaseInfo: optionalStringFromPrimitive,
  released: optionalString,
  imdbRating: optionalStringFromPrimitive,
  aliases: optionalStringArray,
  alternativeTitles: optionalStringArray,
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

export const mediaTrailerSchema = z.object({
  source: z.string().trim().min(1).max(2_048),
  type: z.string().trim().min(1).max(80).optional(),
});

export const metaDetailSchema = metaPreviewSchema.extend({
  background: z.string().optional(),
  logo: z.string().optional(),
  genres: optionalStringArray,
  cast: optionalStringArray,
  director: optionalStringArray,
  runtime: optionalStringFromPrimitive,
  videos: z.array(videoEntrySchema).optional(),
  trailers: z.array(mediaTrailerSchema).max(8).optional(),
});

/**
 * Catalog responses are collections from untrusted providers. A single bad
 * entry should not hide otherwise valid titles or count as an outage, while a
 * non-empty response with no valid entries remains a validation failure.
 */
function normalizeCatalogMetas(value: unknown) {
  if (!Array.isArray(value)) return [];

  const metas = value.flatMap((entry) => {
    const parsed = metaPreviewSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });

  return metas.length > 0 || value.length === 0 ? metas : value;
}

export const catalogResponseSchema = z.object({
  metas: z.preprocess(normalizeCatalogMetas, z.array(metaPreviewSchema)),
});

export const metaResponseSchema = z.object({
  meta: metaDetailSchema,
});
