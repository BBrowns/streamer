import { z } from "zod";
import {
  MAX_SUBTITLE_CANDIDATES,
  normalizedMediaTrackSchema,
  subtitleCandidateSchema,
} from "./media-track.schema";

export const bridgeProtocolVersionSchema = z.literal(1);

export const bridgeDeliverySchema = z.enum([
  "range-http",
  "progressive-fmp4",
  "seekable-cache",
  "hls",
]);

export const bridgeJobStateSchema = z.enum([
  "preparing",
  "ready",
  "no_peers",
  "stalled",
  "error",
  "cancelled",
  "expired",
]);

export const bridgeJobPhaseSchema = z.enum([
  "finding_peers",
  "preparing_metadata",
  "fetching_metadata",
  "selecting_file",
  "checking_piece_availability",
  "remuxing",
  "ready",
  "no_peers",
  "stalled",
  "error",
  "cancelled",
  "expired",
]);

export const bridgeV1ErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "AUTH_REQUIRED",
  "AUTH_NOT_CONFIGURED",
  "FORBIDDEN",
  "PROTOCOL_UNSUPPORTED",
  "IDEMPOTENCY_CONFLICT",
  "DELIVERY_UNSUPPORTED",
  "JOB_NOT_FOUND",
  "JOB_NOT_READY",
  "JOB_CANCELLED",
  "JOB_EXPIRED",
  "NO_PEERS",
  "SOURCE_STALLED",
  "RUNTIME_UNAVAILABLE",
  "TRACKS_UNAVAILABLE",
  "SUBTITLE_NOT_FOUND",
  "SUBTITLE_UNAVAILABLE",
  "THUMBNAIL_UNAVAILABLE",
  "CAST_DEVICE_NOT_FOUND",
  "CAST_SESSION_NOT_FOUND",
  "CAST_SOURCE_REJECTED",
  "CAST_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL",
]);

export const bridgeV1ErrorSchema = z
  .object({
    code: bridgeV1ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    retryAfterMs: z.number().int().positive().max(3_600_000).optional(),
  })
  .strict()
  .superRefine((error, ctx) => {
    if (!error.retryable && error.retryAfterMs !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Non-retryable errors cannot include retryAfterMs.",
        path: ["retryAfterMs"],
      });
    }
  });

export const bridgeErrorResponseV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    error: bridgeV1ErrorSchema,
  })
  .strict();

export const bridgeHelloV1Schema = z
  .object({
    protocol: z
      .object({
        name: z.literal("streamer-bridge"),
        current: bridgeProtocolVersionSchema,
        supported: z.tuple([bridgeProtocolVersionSchema]),
      })
      .strict(),
    serviceVersion: z.string().min(1).max(128),
    auth: z
      .object({
        required: z.literal(true),
        methods: z.tuple([
          z.literal("bearer"),
          z.literal("x-streamer-bridge-token"),
        ]),
      })
      .strict(),
  })
  .strict();

export const bridgeCapabilityDeliveryV1Schema = z
  .object({
    delivery: bridgeDeliverySchema,
    available: z.boolean(),
    unavailableReason: z
      .enum(["torrent_unavailable", "ffmpeg_unavailable"])
      .optional(),
  })
  .strict()
  .superRefine((capability, ctx) => {
    if (capability.available && capability.unavailableReason) {
      ctx.addIssue({
        code: "custom",
        message:
          "Available bridge deliveries cannot include an unavailable reason.",
        path: ["unavailableReason"],
      });
    }

    if (!capability.available && !capability.unavailableReason) {
      ctx.addIssue({
        code: "custom",
        message:
          "Unavailable bridge deliveries must include an unavailable reason.",
        path: ["unavailableReason"],
      });
    }
  });

const bridgeJobsCapabilitiesV1Schema = z
  .object({
    sourceKinds: z.tuple([z.literal("magnet")]),
    deliveries: z.array(bridgeCapabilityDeliveryV1Schema).min(1).max(4),
    cancellation: z.literal(true),
    tracks: z.literal(true),
    subtitles: z.literal(true),
    thumbnails: z.literal(true),
    metrics: z.literal(true),
  })
  .strict()
  .superRefine((capabilities, ctx) => {
    const deliveries = capabilities.deliveries.map(
      (capability) => capability.delivery,
    );
    if (new Set(deliveries).size !== deliveries.length) {
      ctx.addIssue({
        code: "custom",
        message: "Bridge capability deliveries must be unique.",
        path: ["deliveries"],
      });
    }
  });

export const bridgeCapabilitiesV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    owner: z.enum(["desktop", "standalone", "api-supervisor"]),
    health: z.enum(["ready", "degraded", "unavailable"]),
    capabilities: z
      .object({
        jobs: bridgeJobsCapabilitiesV1Schema,
        cast: z
          .object({
            available: z.boolean(),
            controls: z.tuple([
              z.literal("play"),
              z.literal("pause"),
              z.literal("resume"),
              z.literal("seek"),
              z.literal("stop"),
            ]),
          })
          .strict(),
      })
      .strict(),
    limits: z
      .object({
        maxRequestBytes: z.number().int().positive(),
        maxSubtitleBytes: z.number().int().positive(),
        thumbnailBucketSeconds: z.number().int().positive(),
        maxThumbnailBucket: z.number().int().nonnegative(),
        maxThumbnailBytes: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

const bridgeJobSelectionV1Schema = z
  .object({
    fileIndex: z.number().int().nonnegative().optional(),
    title: z.string().min(1).max(512).optional(),
    season: z.number().int().positive().optional(),
    episode: z.number().int().positive().optional(),
  })
  .strict();

export const bridgeCreateJobV1Schema = z
  .object({
    requestId: z.string().uuid(),
    source: z
      .object({
        kind: z.literal("magnet"),
        magnet: z
          .string()
          .min(9)
          .max(8_192)
          .refine((value) => value.startsWith("magnet:?"), {
            message: "Bridge job sources must be magnet URIs.",
          }),
      })
      .strict(),
    delivery: bridgeDeliverySchema,
    selection: bridgeJobSelectionV1Schema.optional(),
  })
  .strict();

export const bridgeSeekableCacheStatusSchema = z.enum([
  "not_started",
  "evaluating",
  "preparing",
  "ready",
  "unavailable",
]);

export const bridgeSeekableCacheUnavailableReasonSchema = z.enum([
  "source_too_large",
  "insufficient_storage",
  "no_download_progress",
  "remux_failed",
  "timed_out",
  "cancelled",
]);

export const bridgeJobMediaV1Schema = z
  .object({
    container: z.enum(["mp4", "webm", "mkv", "unknown"]),
    remuxed: z.boolean(),
    seek: z.enum(["immediate", "preparing", "unavailable"]),
    seekableCache: z
      .object({
        status: bridgeSeekableCacheStatusSchema,
        unavailableReason:
          bridgeSeekableCacheUnavailableReasonSchema.optional(),
      })
      .strict()
      .superRefine((cache, ctx) => {
        if (cache.status === "unavailable" && !cache.unavailableReason) {
          ctx.addIssue({
            code: "custom",
            message:
              "Unavailable seekable caches must include an unavailable reason.",
            path: ["unavailableReason"],
          });
        }

        if (cache.status !== "unavailable" && cache.unavailableReason) {
          ctx.addIssue({
            code: "custom",
            message:
              "Available seekable-cache states cannot include an unavailable reason.",
            path: ["unavailableReason"],
          });
        }
      })
      .optional(),
  })
  .strict();

const bridgeJobStreamV1Schema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(2_048)
      .regex(
        /^\/api\/bridge\/v1\/jobs\/[0-9a-f-]+\/stream(?:\?[^#\s]+)?$/i,
        "Bridge stream paths must be relative signed v1 job paths.",
      ),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

const terminalFailureCodesByState = {
  no_peers: "NO_PEERS",
  stalled: "SOURCE_STALLED",
  cancelled: "JOB_CANCELLED",
  expired: "JOB_EXPIRED",
} as const;

export const bridgeJobV1Schema = z
  .object({
    id: z.string().uuid(),
    state: bridgeJobStateSchema,
    phase: bridgeJobPhaseSchema,
    delivery: bridgeDeliverySchema,
    peerCount: z.number().int().nonnegative().nullable(),
    readinessProgress: z.number().min(0).max(1).nullable(),
    elapsedMs: z.number().int().nonnegative(),
    readyTimeoutMs: z.number().int().positive(),
    media: bridgeJobMediaV1Schema,
    stream: bridgeJobStreamV1Schema.optional(),
    failure: bridgeV1ErrorSchema.optional(),
  })
  .strict()
  .superRefine((job, ctx) => {
    const streamJobId = job.stream?.path
      .split("?")[0]
      .match(/^\/api\/bridge\/v1\/jobs\/([^/]+)\/stream$/)?.[1];

    if (streamJobId && streamJobId.toLowerCase() !== job.id.toLowerCase()) {
      ctx.addIssue({
        code: "custom",
        message: "Bridge stream paths must reference their owning job.",
        path: ["stream", "path"],
      });
    }

    if (job.state === "ready") {
      if (job.phase !== "ready") {
        ctx.addIssue({
          code: "custom",
          message: "Ready bridge jobs must use the ready phase.",
          path: ["phase"],
        });
      }
      if (!job.stream) {
        ctx.addIssue({
          code: "custom",
          message: "Ready bridge jobs must include a signed stream path.",
          path: ["stream"],
        });
      }
      if (job.failure) {
        ctx.addIssue({
          code: "custom",
          message: "Ready bridge jobs cannot include a failure.",
          path: ["failure"],
        });
      }
      return;
    }

    if (job.stream) {
      ctx.addIssue({
        code: "custom",
        message: "Only ready bridge jobs can include a signed stream path.",
        path: ["stream"],
      });
    }

    if (job.state === "preparing") {
      const preparingPhases = new Set([
        "finding_peers",
        "preparing_metadata",
        "fetching_metadata",
        "selecting_file",
        "checking_piece_availability",
        "remuxing",
      ]);
      if (!preparingPhases.has(job.phase)) {
        ctx.addIssue({
          code: "custom",
          message: "Preparing bridge jobs must use a preparation phase.",
          path: ["phase"],
        });
      }
      if (job.failure) {
        ctx.addIssue({
          code: "custom",
          message: "Preparing bridge jobs cannot include a terminal failure.",
          path: ["failure"],
        });
      }
      return;
    }

    if (job.phase !== job.state) {
      ctx.addIssue({
        code: "custom",
        message: "Terminal bridge job state and phase must match.",
        path: ["phase"],
      });
    }

    if (!job.failure) {
      ctx.addIssue({
        code: "custom",
        message: "Terminal bridge jobs must include a failure.",
        path: ["failure"],
      });
      return;
    }

    const expectedCode =
      terminalFailureCodesByState[
        job.state as keyof typeof terminalFailureCodesByState
      ];
    if (expectedCode && job.failure.code !== expectedCode) {
      ctx.addIssue({
        code: "custom",
        message: "Bridge job failure code must match its terminal state.",
        path: ["failure", "code"],
      });
    }
  });

export const bridgeJobResponseV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    job: bridgeJobV1Schema,
  })
  .strict();

export const bridgeJobMetricsV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    jobId: z.string().uuid(),
    sampledAt: z.string().datetime({ offset: true }),
    state: z.enum(["finding_peers", "connecting", "downloading", "ready"]),
    peers: z.number().int().nonnegative(),
    downloadBytesPerSecond: z.number().nonnegative(),
    downloadedBytes: z.number().nonnegative(),
    torrentProgress: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const bridgeSubtitleCandidateV1Schema = subtitleCandidateSchema
  .omit({ fetchIdentity: true })
  .extend({
    documentId: z.string().uuid().optional(),
  })
  .strict();

export const bridgeTrackCatalogV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    jobId: z.string().uuid(),
    mediaId: z.string().uuid(),
    tracks: z.array(normalizedMediaTrackSchema).max(128),
    subtitles: z
      .array(bridgeSubtitleCandidateV1Schema)
      .max(MAX_SUBTITLE_CANDIDATES),
  })
  .strict();

export const bridgeCastDeviceV1Schema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(256),
    type: z.literal("chromecast"),
  })
  .strict();

export const bridgeCastDevicesV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    devices: z.array(bridgeCastDeviceV1Schema).max(128),
  })
  .strict();

const bridgeCastSourceV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("bridge-job"),
      jobId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("external-url"),
      url: z
        .string()
        .url()
        .max(2_048)
        .superRefine((value, ctx) => {
          const parsed = new URL(value);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            ctx.addIssue({
              code: "custom",
              message: "Cast source URLs must use HTTP or HTTPS.",
            });
          }
          if (parsed.username || parsed.password) {
            ctx.addIssue({
              code: "custom",
              message: "Cast source URLs cannot contain credentials.",
            });
          }
        }),
      contentType: z.enum([
        "video/mp4",
        "application/vnd.apple.mpegurl",
        "application/x-mpegURL",
      ]),
    })
    .strict(),
]);

export const bridgeCastPlayV1Schema = z
  .object({
    requestId: z.string().uuid(),
    deviceId: z.string().uuid(),
    source: bridgeCastSourceV1Schema,
    title: z.string().min(1).max(512).optional(),
  })
  .strict();

export const bridgeCastControlActionSchema = z.enum([
  "play",
  "pause",
  "resume",
  "seek",
  "stop",
]);

export const bridgeCastControlV1Schema = z
  .object({
    deviceId: z.string().uuid(),
    action: bridgeCastControlActionSchema,
    positionSeconds: z.number().nonnegative().finite().optional(),
  })
  .strict()
  .superRefine((control, ctx) => {
    if (control.action === "seek" && control.positionSeconds === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Seek controls must include positionSeconds.",
        path: ["positionSeconds"],
      });
    }

    if (control.action !== "seek" && control.positionSeconds !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Only seek controls can include positionSeconds.",
        path: ["positionSeconds"],
      });
    }
  });

export const bridgeCommandResponseV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    success: z.literal(true),
  })
  .strict();

export const bridgeOperationalMetricsV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    sampledAt: z.string().datetime({ offset: true }),
    counters: z
      .object({
        rate_limited: z.number().int().nonnegative(),
        session_issued: z.number().int().nonnegative(),
        session_renewed: z.number().int().nonnegative(),
        session_revoked: z.number().int().nonnegative(),
        idempotency_conflict: z.number().int().nonnegative(),
        terminal_no_peers: z.number().int().nonnegative(),
        terminal_stalled: z.number().int().nonnegative(),
        terminal_error: z.number().int().nonnegative(),
        terminal_cancelled: z.number().int().nonnegative(),
        terminal_expired: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const bridgeCastStatusV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    deviceId: z.string().uuid(),
    currentTime: z.number().nonnegative().finite(),
    duration: z.number().nonnegative().finite(),
    isPaused: z.boolean(),
    playerState: z.string().min(1).max(64),
  })
  .strict();

export const bridgeAccessScopeSchema = z.enum([
  "capabilities:read",
  "jobs:read",
  "jobs:write",
  "cast:read",
  "cast:write",
]);

export const bridgeCreateAccessSessionV1Schema = z
  .object({
    scopes: z.array(bridgeAccessScopeSchema).min(1).max(5),
    ttlSeconds: z.number().int().min(60).max(900).default(300),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (new Set(request.scopes).size !== request.scopes.length) {
      ctx.addIssue({
        code: "custom",
        message: "Bridge access-session scopes must be unique.",
        path: ["scopes"],
      });
    }
  });

export const bridgeAccessSessionV1Schema = z
  .object({
    protocolVersion: bridgeProtocolVersionSchema,
    sessionId: z.string().uuid(),
    accessToken: z.string().min(32).max(512),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const bridgeAccessSessionIdSchema = z.string().uuid();
