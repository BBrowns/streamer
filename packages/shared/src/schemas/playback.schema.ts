import { z } from "zod";

export const playbackActionSchema = z.enum(["play", "download", "cast"]);

export const playbackErrorCodeSchema = z.enum([
  "NO_SOURCES",
  "NO_PEERS",
  "BRIDGE_UNAVAILABLE",
  "BRIDGE_UNSUPPORTED",
  "UNSUPPORTED_CODEC",
  "GATEWAY_TIMEOUT",
  "SOURCE_UNAVAILABLE",
  "NETWORK_OFFLINE",
  "PLAYBACK_TIMEOUT",
  "UNKNOWN",
]);

export const bridgeStatusSchema = z.enum([
  "available",
  "unreachable",
  "wrong-url",
  "loading",
  "no-peers",
  "unsupported",
]);

export const deviceProfileSchema = z.object({
  platform: z.enum([
    "ios",
    "android",
    "web",
    "electron",
    "chromecast",
    "unknown",
  ]),
  maxQuality: z.enum(["2160p", "1080p", "720p", "480p"]),
  network: z.enum(["local", "remote", "unknown"]),
  supports: z.object({
    h264: z.boolean(),
    h265: z.boolean(),
    av1: z.boolean(),
    mp4: z.boolean(),
    mkv: z.boolean(),
    hls: z.boolean(),
    dolbyVision: z.boolean(),
    aac: z.boolean(),
    ac3: z.boolean(),
    eac3: z.boolean(),
  }),
});

export const playbackPlanRequestSchema = z.object({
  type: z.enum(["movie", "series"]),
  id: z.string().min(1),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  action: playbackActionSchema,
  deviceProfile: deviceProfileSchema,
  bridge: z
    .object({
      status: bridgeStatusSchema,
      url: z.string().url().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});
