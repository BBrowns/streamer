import { z } from "zod";
import {
  bridgeStatusSchema,
  deviceProfileSchema,
  playbackActionSchema,
  playbackErrorCodeSchema,
} from "./playback.schema";

const opaqueIdSchema = z.string().uuid();
const timestampSchema = z.string().datetime();

export const playbackSessionStatusSchema = z.enum([
  "created",
  "planning",
  "checking_bridge",
  "selecting_candidate",
  "attempting_candidate",
  "creating_gateway_job",
  "preparing_metadata",
  "finding_peers",
  "remuxing",
  "probing_playback_url",
  "ready",
  "buffering",
  "playing",
  "downloading",
  "verifying_download",
  "casting",
  "trying_fallback",
  "completed",
  "failed",
  "cancelled",
]);

export const playbackSessionSourceTypeSchema = z.enum([
  "direct",
  "hls",
  "torrent",
  "external",
  "unknown",
  "debrid",
  "gateway",
]);

export const playbackAttemptStatusSchema = z.enum([
  "pending",
  "attempting",
  "ready",
  "failed",
  "skipped",
  "cancelled",
]);

export const playbackGatewayPhaseSchema = z.enum([
  "creating_gateway_job",
  "finding_peers",
  "preparing_metadata",
  "fetching_metadata",
  "selecting_file",
  "checking_piece_availability",
  "remuxing",
  "ready",
  "stalled",
  "error",
  "cancelled",
]);

export const playbackSessionContentSchema = z
  .object({
    type: z.enum(["movie", "series"]),
    id: z.string().min(1),
    season: z.number().int().positive().optional(),
    episode: z.number().int().positive().optional(),
  })
  .strict();

export const playbackSessionCandidateSchema = z
  .object({
    id: opaqueIdSchema,
    rank: z.number().int().nonnegative(),
    sourceType: playbackSessionSourceTypeSchema,
    quality: z.enum(["2160p", "1080p", "720p", "480p", "SD"]).optional(),
    container: z.enum(["mp4", "mkv", "hls", "unknown"]).optional(),
    videoCodec: z.enum(["h264", "h265", "av1", "unknown"]).optional(),
    audioCodec: z.enum(["aac", "ac3", "eac3", "unknown"]).optional(),
    hdr: z.enum(["sdr", "hdr10", "dolby-vision", "unknown"]).optional(),
    requiresBridge: z.boolean(),
    requiresRemux: z.boolean(),
    riskFlags: z.array(z.string().min(1)),
  })
  .strict();

export const playbackSessionErrorSchema = z
  .object({
    code: playbackErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    shouldFallback: z.boolean(),
  })
  .strict();

export const playbackAttemptSchema = z
  .object({
    id: opaqueIdSchema,
    candidateId: opaqueIdSchema,
    sourceType: playbackSessionSourceTypeSchema,
    status: playbackAttemptStatusSchema,
    startedAt: timestampSchema.optional(),
    endedAt: timestampSchema.optional(),
    error: playbackSessionErrorSchema.optional(),
  })
  .strict();

export const playbackSessionBridgeSnapshotSchema = z
  .object({
    status: bridgeStatusSchema,
    reason: z.string().min(1).optional(),
  })
  .strict();

export const playbackSessionCastProfileSchema = z
  .object({
    supportsHls: z.boolean(),
    supportsMp4: z.boolean(),
    supportsMkv: z.boolean(),
    supportedCodecs: z.array(z.string().min(1)).optional(),
    canAccessLocalhost: z.boolean(),
    requiresRemoteReachableUrl: z.boolean(),
    remuxAllowed: z.boolean(),
  })
  .strict();

const playbackSessionEventBaseShape = {
  id: opaqueIdSchema,
  sessionId: opaqueIdSchema,
  at: timestampSchema,
};

export const playbackSessionEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("session_created"),
      action: playbackActionSchema,
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("status_changed"),
      from: playbackSessionStatusSchema,
      to: playbackSessionStatusSchema,
      reason: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("candidate_selected"),
      candidateId: opaqueIdSchema,
      reason: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("attempt_started"),
      attemptId: opaqueIdSchema,
      candidateId: opaqueIdSchema,
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("attempt_ready"),
      attemptId: opaqueIdSchema,
      candidateId: opaqueIdSchema,
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("attempt_failed"),
      attemptId: opaqueIdSchema,
      candidateId: opaqueIdSchema,
      error: playbackSessionErrorSchema,
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("attempt_skipped"),
      attemptId: opaqueIdSchema,
      candidateId: opaqueIdSchema,
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("gateway_job_attached"),
      gatewayJobId: opaqueIdSchema,
      candidateId: opaqueIdSchema,
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("gateway_progress"),
      gatewayJobId: opaqueIdSchema,
      phase: playbackGatewayPhaseSchema,
      progress: z.number().min(0).max(1).optional(),
      peerCount: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("download_progress"),
      progress: z.number().min(0).max(1),
      totalBytesWritten: z.number().int().nonnegative().optional(),
      totalBytesExpectedToWrite: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("download_verified"),
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("fallback_started"),
      fromCandidateId: opaqueIdSchema,
      toCandidateId: opaqueIdSchema,
      reason: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("session_failed"),
      error: playbackSessionErrorSchema,
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("session_cancelled"),
      reason: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      ...playbackSessionEventBaseShape,
      type: z.literal("session_completed"),
    })
    .strict(),
]);

function hasDuplicate(values: string[]) {
  return new Set(values).size !== values.length;
}

export const playbackSessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: opaqueIdSchema,
    action: playbackActionSchema,
    status: playbackSessionStatusSchema,
    content: playbackSessionContentSchema,
    candidates: z.array(playbackSessionCandidateSchema),
    attempts: z.array(playbackAttemptSchema),
    selectedCandidateId: opaqueIdSchema.optional(),
    gatewayJobId: opaqueIdSchema.optional(),
    deviceProfile: deviceProfileSchema,
    bridge: playbackSessionBridgeSnapshotSchema.optional(),
    castProfile: playbackSessionCastProfileSchema.optional(),
    timeoutBudgetMs: z.number().int().positive(),
    terminalError: playbackSessionErrorSchema.optional(),
    eventLog: z.array(playbackSessionEventSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((session, ctx) => {
    const candidateIds = session.candidates.map((candidate) => candidate.id);
    const attemptIds = session.attempts.map((attempt) => attempt.id);
    const eventIds = session.eventLog.map((event) => event.id);
    const candidateIdSet = new Set(candidateIds);
    const attemptIdSet = new Set(attemptIds);

    if (hasDuplicate(candidateIds)) {
      ctx.addIssue({
        code: "custom",
        message: "Playback session candidate ids must be unique.",
        path: ["candidates"],
      });
    }

    if (hasDuplicate(attemptIds)) {
      ctx.addIssue({
        code: "custom",
        message: "Playback session attempt ids must be unique.",
        path: ["attempts"],
      });
    }

    if (hasDuplicate(eventIds)) {
      ctx.addIssue({
        code: "custom",
        message: "Playback session event ids must be unique.",
        path: ["eventLog"],
      });
    }

    if (
      session.selectedCandidateId &&
      !candidateIdSet.has(session.selectedCandidateId)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "selectedCandidateId must reference a session candidate.",
        path: ["selectedCandidateId"],
      });
    }

    session.attempts.forEach((attempt, index) => {
      if (!candidateIdSet.has(attempt.candidateId)) {
        ctx.addIssue({
          code: "custom",
          message: "Attempt candidateId must reference a session candidate.",
          path: ["attempts", index, "candidateId"],
        });
      }
    });

    session.eventLog.forEach((event, index) => {
      if (event.sessionId !== session.id) {
        ctx.addIssue({
          code: "custom",
          message: "Event sessionId must match the playback session id.",
          path: ["eventLog", index, "sessionId"],
        });
      }

      const candidateReferences =
        event.type === "fallback_started"
          ? [event.fromCandidateId, event.toCandidateId]
          : "candidateId" in event
            ? [event.candidateId]
            : [];

      candidateReferences.forEach((candidateId) => {
        if (!candidateIdSet.has(candidateId)) {
          ctx.addIssue({
            code: "custom",
            message: "Event candidate reference must exist in the session.",
            path: ["eventLog", index],
          });
        }
      });

      if ("attemptId" in event && !attemptIdSet.has(event.attemptId)) {
        ctx.addIssue({
          code: "custom",
          message: "Event attempt reference must exist in the session.",
          path: ["eventLog", index, "attemptId"],
        });
      }
    });
  });
