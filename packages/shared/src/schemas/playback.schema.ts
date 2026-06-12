import { z } from "zod";
import { streamSchema } from "./stream.schema";

export const playbackActionSchema = z.enum(["play", "download", "cast"]);

export const playbackErrorCodeSchema = z.enum([
  "NO_SOURCES",
  "NO_PLAYABLE_SOURCE",
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

export const playbackRejectReasonSchema = z.enum([
  "no_sources",
  "unsupported_codec",
  "unsupported_container",
  "bridge_unavailable",
  "hls_offline_unsupported",
  "torrent_no_bridge",
  "device_incompatible",
  "cast_device_incompatible",
  "localhost_not_castable",
  "source_missing_url",
  "unknown_stream_type",
]);

export const playbackDecisionReasonCodeSchema = z.enum([
  "selected_highest_score",
  "direct_source_preferred",
  "hls_source_preferred",
  "bridge_source_selected",
  "remux_selected",
  "offline_eligible_source_selected",
  "cast_compatible_source_selected",
  "device_compatible",
  "quality_within_profile",
  "quality_above_profile",
  "fallbacks_available",
  "bridge_required",
  "no_action_eligible_candidates",
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

export const playbackActionEligibilitySchema = z
  .object({
    action: playbackActionSchema,
    eligible: z.boolean(),
    reason: playbackRejectReasonSchema.optional(),
  })
  .strict()
  .superRefine((eligibility, ctx) => {
    if (eligibility.eligible && eligibility.reason) {
      ctx.addIssue({
        code: "custom",
        message: "Eligible actions cannot include a rejection reason.",
        path: ["reason"],
      });
    }

    if (!eligibility.eligible && !eligibility.reason) {
      ctx.addIssue({
        code: "custom",
        message: "Ineligible actions must include a rejection reason.",
        path: ["reason"],
      });
    }
  });

export const playbackDeviceCompatibilitySchema = z
  .object({
    compatible: z.boolean(),
    containerSupported: z.boolean(),
    videoCodecSupported: z.boolean(),
    audioCodecSupported: z.boolean(),
    qualityWithinProfile: z.boolean(),
    sourceReachable: z.boolean(),
  })
  .strict();

export const playbackTimeoutBudgetSchema = z
  .object({
    totalMs: z.number().int().positive(),
    directProbeMs: z.number().int().positive(),
    hlsProbeMs: z.number().int().positive(),
    bridgeConnectMs: z.number().int().positive(),
    torrentMetadataMs: z.number().int().positive(),
    peerDiscoveryMs: z.number().int().positive(),
    remuxReadyMs: z.number().int().positive(),
  })
  .strict();

export const mediaCandidateSchema = z
  .object({
    id: z.string().uuid(),
    stream: streamSchema,
    kind: z.enum(["direct", "hls", "torrent", "external", "unknown"]),
    quality: z.enum(["2160p", "1080p", "720p", "480p", "SD"]).optional(),
    container: z.enum(["mp4", "mkv", "hls", "unknown"]).optional(),
    videoCodec: z.enum(["h264", "h265", "av1", "unknown"]).optional(),
    audioCodec: z.enum(["aac", "ac3", "eac3", "unknown"]).optional(),
    hdr: z.enum(["sdr", "hdr10", "dolby-vision", "unknown"]).optional(),
    seeders: z.number().optional(),
    sizeBytes: z.number().nonnegative().optional(),
    riskFlags: z.array(z.string()),
  })
  .strict();

export const plannedMediaCandidateSchema = mediaCandidateSchema
  .extend({
    rank: z.number().int().nonnegative(),
    score: z.number(),
    requiresBridge: z.boolean(),
    requiresRemux: z.boolean(),
    deviceCompatibility: playbackDeviceCompatibilitySchema,
    actionEligibility: playbackActionEligibilitySchema,
    decisionReasons: z.array(playbackDecisionReasonCodeSchema),
  })
  .strict();

export const rejectedCandidateSchema = z
  .object({
    candidateId: z.string().uuid(),
    title: z.string().optional(),
    reason: z.string().min(1),
    reasonCode: playbackRejectReasonSchema,
    requiresBridge: z.boolean(),
    requiresRemux: z.boolean(),
    deviceCompatibility: playbackDeviceCompatibilitySchema,
    actionEligibility: playbackActionEligibilitySchema,
  })
  .strict();

export const playbackDecisionReasonSchema = z
  .object({
    code: playbackDecisionReasonCodeSchema,
    message: z.string().min(1),
    candidateId: z.string().uuid().optional(),
  })
  .strict();

export const playbackPlanSchema = z
  .object({
    version: z.literal(2),
    action: playbackActionSchema,
    state: z.enum([
      "ready",
      "needsBridge",
      "bridgeUnavailable",
      "needsTranscode",
      "unsupported",
      "notFound",
    ]),
    selectedCandidate: plannedMediaCandidateSchema.optional(),
    fallbackCandidates: z.array(plannedMediaCandidateSchema),
    orderedCandidates: z.array(plannedMediaCandidateSchema),
    rejectedCandidates: z.array(rejectedCandidateSchema),
    decisionReasons: z.array(playbackDecisionReasonSchema),
    actionEligibility: playbackActionEligibilitySchema,
    timeoutBudget: playbackTimeoutBudgetSchema,
    requiresBridge: z.boolean(),
    requiresRemux: z.boolean(),
    deviceCompatibility: playbackDeviceCompatibilitySchema.optional(),
    plan: z
      .object({
        mode: z.enum(["direct", "hls", "bridge", "remux", "transcode"]),
        selectedCandidate: plannedMediaCandidateSchema,
        fallbackCandidates: z.array(plannedMediaCandidateSchema).optional(),
        playbackUrl: z.string().url().optional(),
      })
      .strict()
      .optional(),
    userMessage: z.string().optional(),
    debug: z
      .object({
        rejectedCandidates: z.array(rejectedCandidateSchema),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const candidatesMatch = (
      first: z.infer<typeof plannedMediaCandidateSchema> | undefined,
      second: z.infer<typeof plannedMediaCandidateSchema> | undefined,
    ) => JSON.stringify(first) === JSON.stringify(second);
    const orderedIds = plan.orderedCandidates.map((candidate) => candidate.id);
    const rejectedIds = new Set(
      plan.rejectedCandidates.map((candidate) => candidate.candidateId),
    );

    if (new Set(orderedIds).size !== orderedIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "orderedCandidates must contain unique candidate ids.",
        path: ["orderedCandidates"],
      });
    }

    plan.orderedCandidates.forEach((candidate, index) => {
      if (candidate.rank !== index) {
        ctx.addIssue({
          code: "custom",
          message: "Candidate rank must match its orderedCandidates index.",
          path: ["orderedCandidates", index, "rank"],
        });
      }

      if (candidate.actionEligibility.action !== plan.action) {
        ctx.addIssue({
          code: "custom",
          message: "Candidate action eligibility must match the plan action.",
          path: ["orderedCandidates", index, "actionEligibility", "action"],
        });
      }

      if (!candidate.actionEligibility.eligible) {
        ctx.addIssue({
          code: "custom",
          message: "Ordered candidates must be eligible for the plan action.",
          path: ["orderedCandidates", index, "actionEligibility", "eligible"],
        });
      }

      if (rejectedIds.has(candidate.id)) {
        ctx.addIssue({
          code: "custom",
          message: "A candidate cannot be both ordered and rejected.",
          path: ["orderedCandidates", index, "id"],
        });
      }
    });

    plan.rejectedCandidates.forEach((candidate, index) => {
      if (candidate.actionEligibility.action !== plan.action) {
        ctx.addIssue({
          code: "custom",
          message:
            "Rejected candidate action eligibility must match the plan action.",
          path: ["rejectedCandidates", index, "actionEligibility", "action"],
        });
      }

      if (candidate.actionEligibility.eligible) {
        ctx.addIssue({
          code: "custom",
          message:
            "Rejected candidates cannot be eligible for the plan action.",
          path: ["rejectedCandidates", index, "actionEligibility", "eligible"],
        });
      }

      if (candidate.actionEligibility.reason !== candidate.reasonCode) {
        ctx.addIssue({
          code: "custom",
          message:
            "Rejected candidate eligibility reason must match its reasonCode.",
          path: ["rejectedCandidates", index, "actionEligibility", "reason"],
        });
      }
    });

    if (plan.debug) {
      if (
        JSON.stringify(plan.rejectedCandidates) !==
        JSON.stringify(plan.debug.rejectedCandidates)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Debug rejectedCandidates must match the top-level rejectedCandidates.",
          path: ["debug", "rejectedCandidates"],
        });
      }
    }

    if (plan.actionEligibility.action !== plan.action) {
      ctx.addIssue({
        code: "custom",
        message: "Plan action eligibility must match the plan action.",
        path: ["actionEligibility", "action"],
      });
    }

    if (plan.state === "ready") {
      if (!plan.selectedCandidate || !plan.plan) {
        ctx.addIssue({
          code: "custom",
          message: "Ready plans must include a selected candidate and plan.",
          path: ["selectedCandidate"],
        });
        return;
      }

      if (!plan.actionEligibility.eligible) {
        ctx.addIssue({
          code: "custom",
          message: "Ready plans must be eligible for their requested action.",
          path: ["actionEligibility", "eligible"],
        });
      }

      if (plan.orderedCandidates[0]?.id !== plan.selectedCandidate.id) {
        ctx.addIssue({
          code: "custom",
          message:
            "selectedCandidate must be the first ordered candidate in a ready plan.",
          path: ["selectedCandidate", "id"],
        });
      }

      if (!candidatesMatch(plan.orderedCandidates[0], plan.selectedCandidate)) {
        ctx.addIssue({
          code: "custom",
          message:
            "selectedCandidate must match the first ordered candidate in a ready plan.",
          path: ["selectedCandidate"],
        });
      }

      const expectedFallbackCandidates = plan.orderedCandidates.slice(
        1,
        1 + plan.fallbackCandidates.length,
      );
      if (
        !plan.fallbackCandidates.every((candidate, index) =>
          candidatesMatch(candidate, expectedFallbackCandidates[index]),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "fallbackCandidates must preserve the ordered candidate sequence.",
          path: ["fallbackCandidates"],
        });
      }

      if (
        !candidatesMatch(plan.plan.selectedCandidate, plan.selectedCandidate)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Legacy plan selectedCandidate must match the top-level selectedCandidate.",
          path: ["plan", "selectedCandidate", "id"],
        });
      }

      const legacyFallbackCandidates = plan.plan.fallbackCandidates || [];
      if (
        legacyFallbackCandidates.length !== plan.fallbackCandidates.length ||
        !legacyFallbackCandidates.every((candidate, index) =>
          candidatesMatch(candidate, plan.fallbackCandidates[index]),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Legacy plan fallbackCandidates must match the top-level fallbackCandidates.",
          path: ["plan", "fallbackCandidates"],
        });
      }

      if (plan.requiresBridge !== plan.selectedCandidate.requiresBridge) {
        ctx.addIssue({
          code: "custom",
          message:
            "Plan requiresBridge must match the selected candidate requirement.",
          path: ["requiresBridge"],
        });
      }

      if (plan.requiresRemux !== plan.selectedCandidate.requiresRemux) {
        ctx.addIssue({
          code: "custom",
          message:
            "Plan requiresRemux must match the selected candidate requirement.",
          path: ["requiresRemux"],
        });
      }

      if (
        JSON.stringify(plan.deviceCompatibility) !==
        JSON.stringify(plan.selectedCandidate.deviceCompatibility)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Plan deviceCompatibility must match the selected candidate compatibility.",
          path: ["deviceCompatibility"],
        });
      }
      return;
    }

    if (
      plan.selectedCandidate ||
      plan.fallbackCandidates.length > 0 ||
      plan.plan
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Non-ready plans cannot include selected or fallback candidates.",
        path: ["selectedCandidate"],
      });
    }

    if (plan.actionEligibility.eligible) {
      ctx.addIssue({
        code: "custom",
        message:
          "Non-ready plans cannot be eligible for their requested action.",
        path: ["actionEligibility", "eligible"],
      });
    }
  });
