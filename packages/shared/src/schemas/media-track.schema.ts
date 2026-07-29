import { z } from "zod";

export const MAX_SUBTITLE_CANDIDATES = 512;

export const mediaTrackKindSchema = z.enum(["audio", "subtitle"]);
export const mediaTrackSourceSchema = z.enum([
  "native",
  "embedded",
  "torrent-file",
  "addon",
]);

export const normalizedMediaTrackSchema = z
  .object({
    id: z.string().min(1).max(256),
    streamIndex: z.number().int().nonnegative(),
    kind: mediaTrackKindSchema,
    language: z.string().min(1).max(32),
    title: z.string().max(256).optional(),
    codec: z.string().min(1).max(64),
    channelCount: z.number().int().positive().max(64).optional(),
    channelLayout: z.string().max(64).optional(),
    default: z.boolean(),
    forced: z.boolean(),
    hearingImpaired: z.boolean(),
    audioDescription: z.boolean(),
    commentary: z.boolean(),
    source: mediaTrackSourceSchema,
    supported: z.boolean(),
    unsupportedReason: z
      .enum(["bitmap_subtitle", "codec", "platform"])
      .optional(),
  })
  .strict();

export const subtitleCandidateSchema = z
  .object({
    id: z.string().min(1).max(512),
    providerId: z.string().min(1).max(256).optional(),
    providerName: z.string().min(1).max(256).optional(),
    language: z.string().min(1).max(32),
    format: z.enum(["srt", "vtt", "ass", "ssa", "cue-json", "unknown"]),
    source: z.enum(["embedded", "torrent-file", "addon"]),
    label: z.string().min(1).max(512),
    releaseName: z.string().max(512).optional(),
    hearingImpaired: z.boolean(),
    forced: z.boolean(),
    fps: z.number().positive().max(240).optional(),
    fileHashMatch: z.boolean(),
    fileNameMatch: z.boolean(),
    contentIdMatch: z.boolean(),
    confidence: z.number().min(0).max(1),
    active: z.boolean(),
    fetchIdentity: z.string().min(1).max(512).optional(),
  })
  .strict();

export const gatewayTrackCatalogSchema = z
  .object({
    jobId: z.string().min(1).max(256),
    selectedFileIndex: z.number().int().nonnegative(),
    tracks: z.array(normalizedMediaTrackSchema).max(128),
    subtitles: z.array(subtitleCandidateSchema).max(MAX_SUBTITLE_CANDIDATES),
  })
  .strict();

export const addonSubtitleCatalogSchema = z
  .object({
    subtitles: z.array(subtitleCandidateSchema).max(MAX_SUBTITLE_CANDIDATES),
  })
  .strict();

export type NormalizedMediaTrackInput = z.infer<
  typeof normalizedMediaTrackSchema
>;
export type SubtitleCandidateInput = z.infer<typeof subtitleCandidateSchema>;
export type GatewayTrackCatalogInput = z.infer<
  typeof gatewayTrackCatalogSchema
>;
export type AddonSubtitleCatalogInput = z.infer<
  typeof addonSubtitleCatalogSchema
>;
