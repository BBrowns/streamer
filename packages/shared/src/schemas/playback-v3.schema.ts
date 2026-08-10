import { z } from "zod";
import {
  playbackActionSchema,
  playbackDecisionReasonSchema,
  playbackDeviceCompatibilitySchema,
  playbackPlanRequestSchema,
  playbackPlanSchema,
  playbackSourceDiscoverySchema,
  playbackTimeoutBudgetSchema,
  plannedMediaCandidateSchema,
  rejectedCandidateSchema,
} from "./playback.schema";

export const playbackExecutionTargetSchema = z.enum([
  "on-device",
  "local-sidecar",
  "paired-bridge",
  "debrid",
  "remote-bridge",
]);

export const playbackDeliverySchema = z.enum([
  "direct",
  "hls",
  "range-http",
  "progressive-fmp4",
  "seekable-cache",
  "offline-file",
]);

export const playbackRouteCapabilitiesSchema = z
  .object({
    seek: z.enum(["immediate", "preparing", "unavailable"]),
    audioTracks: z.boolean(),
    embeddedSubtitles: z.boolean(),
    externalSubtitles: z.boolean(),
    cast: z.boolean(),
    offline: z.boolean(),
    thumbnails: z.boolean(),
  })
  .strict();

export const playbackRouteSchema = z
  .object({
    candidateId: z.string().uuid(),
    executionTarget: playbackExecutionTargetSchema,
    delivery: playbackDeliverySchema,
    capabilities: playbackRouteCapabilitiesSchema,
  })
  .strict();

export const playbackRoutableSourceKindSchema = z.enum([
  "direct",
  "hls",
  "torrent",
]);

export const playbackExecutionNodeDeliverySchema = z
  .object({
    delivery: playbackDeliverySchema,
    capabilities: playbackRouteCapabilitiesSchema,
  })
  .strict();

const bridgeExecutionTargets = new Set([
  "local-sidecar",
  "paired-bridge",
  "remote-bridge",
]);

export const playbackExecutionNodeSchema = z
  .object({
    executionTarget: playbackExecutionTargetSchema,
    availability: z.enum([
      "available",
      "checking",
      "unavailable",
      "unsupported",
    ]),
    acceptedSourceKinds: z.array(playbackRoutableSourceKindSchema).max(3),
    deliveries: z.array(playbackExecutionNodeDeliverySchema).max(6),
    bridgeProtocolVersion: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((node, ctx) => {
    if (
      new Set(node.acceptedSourceKinds).size !== node.acceptedSourceKinds.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Execution-node source kinds must be unique.",
        path: ["acceptedSourceKinds"],
      });
    }

    const deliveries = node.deliveries.map((delivery) => delivery.delivery);
    if (new Set(deliveries).size !== deliveries.length) {
      ctx.addIssue({
        code: "custom",
        message: "Execution-node deliveries must be unique.",
        path: ["deliveries"],
      });
    }

    if (node.availability === "available") {
      if (node.acceptedSourceKinds.length === 0) {
        ctx.addIssue({
          code: "custom",
          message:
            "Available execution nodes must accept at least one source kind.",
          path: ["acceptedSourceKinds"],
        });
      }

      if (node.deliveries.length === 0) {
        ctx.addIssue({
          code: "custom",
          message:
            "Available execution nodes must advertise at least one delivery.",
          path: ["deliveries"],
        });
      }
    } else {
      if (node.acceptedSourceKinds.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: "Unavailable execution nodes cannot accept source kinds.",
          path: ["acceptedSourceKinds"],
        });
      }

      if (node.deliveries.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: "Unavailable execution nodes cannot advertise deliveries.",
          path: ["deliveries"],
        });
      }
    }

    const bridgeOwned = bridgeExecutionTargets.has(node.executionTarget);
    if (bridgeOwned && node.bridgeProtocolVersion === undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          "Bridge execution nodes must declare a positive protocol version.",
        path: ["bridgeProtocolVersion"],
      });
    }

    if (!bridgeOwned && node.bridgeProtocolVersion !== undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          "Non-bridge execution nodes cannot declare a bridge protocol version.",
        path: ["bridgeProtocolVersion"],
      });
    }
  });

export const playbackPlanV3RequestSchema = playbackPlanRequestSchema
  .omit({ bridge: true })
  .extend({
    version: z.literal(3),
    executionNodes: z.array(playbackExecutionNodeSchema).min(1).max(5),
  })
  .strict()
  .superRefine((request, ctx) => {
    const targets = request.executionNodes.map((node) => node.executionTarget);
    if (new Set(targets).size !== targets.length) {
      ctx.addIssue({
        code: "custom",
        message: "executionNodes must contain unique execution targets.",
        path: ["executionNodes"],
      });
    }
  });

export const playbackRouteRejectReasonSchema = z.enum([
  "execution_target_unavailable",
  "source_kind_unsupported",
  "delivery_unsupported",
  "action_capability_unsupported",
  "protocol_unsupported",
]);

export const playbackRejectReasonV3Schema = z.union([
  rejectedCandidateSchema.shape.reasonCode,
  playbackRouteRejectReasonSchema,
]);

export const playbackActionEligibilityV3Schema = z
  .object({
    action: playbackActionSchema,
    eligible: z.boolean(),
    reason: playbackRejectReasonV3Schema.optional(),
    preflightReason:
      rejectedCandidateSchema.shape.actionEligibility.shape.preflightReason,
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

export const plannedMediaCandidateV3Schema = plannedMediaCandidateSchema
  .extend({
    actionEligibility: playbackActionEligibilityV3Schema,
    route: playbackRouteSchema,
  })
  .strict();

export const rejectedCandidateV3Schema = rejectedCandidateSchema
  .extend({
    reasonCode: playbackRejectReasonV3Schema,
    actionEligibility: playbackActionEligibilityV3Schema,
  })
  .strict();

const playbackPlanStateSchema = z.enum([
  "ready",
  "needsBridge",
  "bridgeUnavailable",
  "needsTranscode",
  "unsupported",
  "notFound",
]);

function valuesMatch(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export const playbackPlanV3Schema = z
  .object({
    version: z.literal(3),
    action: playbackActionSchema,
    state: playbackPlanStateSchema,
    sourceDiscovery: playbackSourceDiscoverySchema.optional(),
    selectedCandidate: plannedMediaCandidateV3Schema.optional(),
    fallbackCandidates: z.array(plannedMediaCandidateV3Schema).max(4),
    orderedCandidates: z.array(plannedMediaCandidateV3Schema),
    rejectedCandidates: z.array(rejectedCandidateV3Schema),
    decisionReasons: z.array(playbackDecisionReasonSchema),
    actionEligibility: playbackActionEligibilityV3Schema,
    timeoutBudget: playbackTimeoutBudgetSchema,
    requiresBridge: z.boolean(),
    requiresRemux: z.boolean(),
    deviceCompatibility: playbackDeviceCompatibilitySchema.optional(),
    userMessage: z.string().optional(),
    debug: z
      .object({
        rejectedCandidates: z.array(rejectedCandidateV3Schema),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const orderedIds = plan.orderedCandidates.map((candidate) => candidate.id);
    const rejectedIds = plan.rejectedCandidates.map(
      (candidate) => candidate.candidateId,
    );
    const rejectedIdSet = new Set(rejectedIds);

    if (new Set(orderedIds).size !== orderedIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "orderedCandidates must contain unique candidate ids.",
        path: ["orderedCandidates"],
      });
    }

    if (new Set(rejectedIds).size !== rejectedIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "rejectedCandidates must contain unique candidate ids.",
        path: ["rejectedCandidates"],
      });
    }

    plan.orderedCandidates.forEach((candidate, index) => {
      if (candidate.route.candidateId !== candidate.id) {
        ctx.addIssue({
          code: "custom",
          message: "Playback route candidateId must match its candidate.",
          path: ["orderedCandidates", index, "route", "candidateId"],
        });
      }

      const routeRequiresBridge = bridgeExecutionTargets.has(
        candidate.route.executionTarget,
      );
      if (candidate.requiresBridge !== routeRequiresBridge) {
        ctx.addIssue({
          code: "custom",
          message: "Candidate requiresBridge must match its execution target.",
          path: ["orderedCandidates", index, "requiresBridge"],
        });
      }

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

      if (rejectedIdSet.has(candidate.id)) {
        ctx.addIssue({
          code: "custom",
          message: "A candidate cannot be both ordered and rejected.",
          path: ["orderedCandidates", index, "id"],
        });
      }

      if (
        (plan.action === "cast" && !candidate.route.capabilities.cast) ||
        (plan.action === "download" && !candidate.route.capabilities.offline) ||
        (plan.action === "play" &&
          candidate.route.capabilities.seek === "unavailable")
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Candidate route capabilities must support the requested action.",
          path: ["orderedCandidates", index, "route", "capabilities"],
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

    if (
      plan.debug &&
      !valuesMatch(plan.rejectedCandidates, plan.debug.rejectedCandidates)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Debug rejectedCandidates must match the top-level rejectedCandidates.",
        path: ["debug", "rejectedCandidates"],
      });
    }

    if (plan.actionEligibility.action !== plan.action) {
      ctx.addIssue({
        code: "custom",
        message: "Plan action eligibility must match the plan action.",
        path: ["actionEligibility", "action"],
      });
    }

    if (plan.state === "ready") {
      if (!plan.selectedCandidate || plan.orderedCandidates.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Ready plans must include a selected candidate.",
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

      if (!valuesMatch(plan.orderedCandidates[0], plan.selectedCandidate)) {
        ctx.addIssue({
          code: "custom",
          message:
            "selectedCandidate must match the first ordered candidate in a ready plan.",
          path: ["selectedCandidate"],
        });
      }

      if (
        plan.selectedCandidate.route.candidateId !== plan.selectedCandidate.id
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Playback route candidateId must match its candidate.",
          path: ["selectedCandidate", "route", "candidateId"],
        });
      }

      const expectedFallbacks = plan.orderedCandidates.slice(1, 5);
      if (!valuesMatch(plan.fallbackCandidates, expectedFallbacks)) {
        ctx.addIssue({
          code: "custom",
          message:
            "fallbackCandidates must be the first four ordered fallbacks.",
          path: ["fallbackCandidates"],
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
        !valuesMatch(
          plan.deviceCompatibility,
          plan.selectedCandidate.deviceCompatibility,
        )
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
      plan.orderedCandidates.length > 0
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Non-ready plans cannot include selected, ordered, or fallback candidates.",
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

export const playbackPlanResponseSchema = z.union([
  playbackPlanSchema,
  playbackPlanV3Schema,
]);
