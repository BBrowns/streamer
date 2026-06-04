import {
  playbackPlanSchema,
  playbackSessionEventSchema,
  playbackSessionSchema,
  type DeviceProfile,
  type PlaybackPlan,
  type PlaybackRuntimeError,
  type PlaybackSession,
  type PlaybackSessionBridgeSnapshot,
  type PlaybackSessionCandidate,
  type PlaybackSessionCastProfile,
  type PlaybackSessionContent,
  type PlaybackSessionError,
  type PlaybackSessionEvent,
  type PlaybackSessionStatus,
  type PlannedMediaCandidate,
} from "@streamer/shared";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type PlaybackSessionEventInput = DistributiveOmit<
  PlaybackSessionEvent,
  "id" | "sessionId" | "at"
>;

export interface CreatePlaybackSessionInput {
  plan: PlaybackPlan;
  content: PlaybackSessionContent;
  deviceProfile: DeviceProfile;
  bridge?: PlaybackSessionBridgeSnapshot;
  castProfile?: PlaybackSessionCastProfile;
}

export interface PlaybackSessionRuntime {
  plan: PlaybackPlan;
  candidates: Record<string, PlannedMediaCandidate>;
}

export interface PlaybackSessionBundle {
  session: PlaybackSession;
  runtime: PlaybackSessionRuntime;
}

export interface PlaybackSessionFactoryOptions {
  idFactory: () => string;
  now: () => string;
}

const TERMINAL_STATUSES = new Set<PlaybackSessionStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export class PlaybackSessionReducerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaybackSessionReducerError";
  }
}

function assertSessionRule(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new PlaybackSessionReducerError(message);
  }
}

function cloneDeviceProfile(deviceProfile: DeviceProfile): DeviceProfile {
  return {
    ...deviceProfile,
    supports: { ...deviceProfile.supports },
  };
}

function toSessionCandidate(
  candidate: PlannedMediaCandidate,
  id: string,
): PlaybackSessionCandidate {
  return {
    id,
    rank: candidate.rank,
    sourceType: candidate.kind,
    quality: candidate.quality,
    container: candidate.container,
    videoCodec: candidate.videoCodec,
    audioCodec: candidate.audioCodec,
    hdr: candidate.hdr,
    requiresBridge: candidate.requiresBridge,
    requiresRemux: candidate.requiresRemux,
    riskFlags: [...candidate.riskFlags],
  };
}

export function toPlaybackSessionError(
  error: PlaybackRuntimeError,
): PlaybackSessionError {
  return {
    code: error.code,
    message: error.message.replace(
      /\b(?:https?:\/\/|magnet:\?)[^\s]+/gi,
      "[redacted]",
    ),
    retryable: error.retryable,
    shouldFallback: error.shouldFallback,
  };
}

export function createPlaybackSessionEvent(
  sessionId: string,
  event: PlaybackSessionEventInput,
  options: PlaybackSessionFactoryOptions,
): PlaybackSessionEvent {
  return playbackSessionEventSchema.parse({
    ...event,
    id: options.idFactory(),
    sessionId,
    at: options.now(),
  });
}

export function createPlaybackSessionFromPlan(
  input: CreatePlaybackSessionInput,
  options: PlaybackSessionFactoryOptions,
): PlaybackSessionBundle {
  const plan = playbackPlanSchema.parse(input.plan);
  const sessionId = options.idFactory();
  const createdAt = options.now();
  const runtimeCandidates: Record<string, PlannedMediaCandidate> = {};
  const planCandidateToSessionCandidate = new Map<string, string>();

  const candidates = plan.orderedCandidates.map((candidate) => {
    const sessionCandidateId = options.idFactory();
    planCandidateToSessionCandidate.set(candidate.id, sessionCandidateId);
    runtimeCandidates[sessionCandidateId] = candidate;
    return toSessionCandidate(candidate, sessionCandidateId);
  });

  const createdEvent = playbackSessionEventSchema.parse({
    id: options.idFactory(),
    sessionId,
    at: createdAt,
    type: "session_created",
    action: plan.action,
  });

  let session = playbackSessionSchema.parse({
    schemaVersion: 1,
    id: sessionId,
    action: plan.action,
    status: "created",
    content: input.content,
    candidates,
    attempts: [],
    deviceProfile: cloneDeviceProfile(input.deviceProfile),
    bridge: input.bridge,
    castProfile: input.castProfile,
    timeoutBudgetMs: plan.timeoutBudget.totalMs,
    eventLog: [createdEvent],
    createdAt,
    updatedAt: createdAt,
  });

  if (plan.selectedCandidate) {
    const selectedCandidateId = planCandidateToSessionCandidate.get(
      plan.selectedCandidate.id,
    );
    assertSessionRule(
      selectedCandidateId,
      "Selected planner candidate is missing from ordered candidates.",
    );

    session = reducePlaybackSession(
      session,
      createPlaybackSessionEvent(
        sessionId,
        {
          type: "candidate_selected",
          candidateId: selectedCandidateId,
          reason: plan.decisionReasons[0]?.message,
        },
        options,
      ),
    );
  }

  return {
    session,
    runtime: {
      plan,
      candidates: runtimeCandidates,
    },
  };
}

function findCandidate(session: PlaybackSession, candidateId: string) {
  const candidate = session.candidates.find((item) => item.id === candidateId);
  assertSessionRule(
    candidate,
    "Event candidate does not exist in the session.",
  );
  return candidate;
}

function findAttempt(session: PlaybackSession, attemptId: string) {
  const attempt = session.attempts.find((item) => item.id === attemptId);
  assertSessionRule(attempt, "Event attempt does not exist in the session.");
  return attempt;
}

function statusForGatewayPhase(
  phase: Extract<PlaybackSessionEvent, { type: "gateway_progress" }>["phase"],
): PlaybackSessionStatus | null {
  if (phase === "creating_gateway_job") return "creating_gateway_job";
  if (phase === "finding_peers" || phase === "stalled") return "finding_peers";
  if (
    phase === "preparing_metadata" ||
    phase === "fetching_metadata" ||
    phase === "selecting_file" ||
    phase === "checking_piece_availability"
  ) {
    return "preparing_metadata";
  }
  if (phase === "remuxing") return "remuxing";
  if (phase === "ready") return "ready";
  return null;
}

function assertEventOrder(
  session: PlaybackSession,
  event: PlaybackSessionEvent,
) {
  const lastEvent = session.eventLog.at(-1);
  if (!lastEvent) return;

  assertSessionRule(
    Date.parse(event.at) >= Date.parse(lastEvent.at),
    "Playback session events must be applied in chronological order.",
  );
}

function replaceAttempt(
  session: PlaybackSession,
  attemptId: string,
  update: PlaybackSession["attempts"][number],
) {
  return session.attempts.map((attempt) =>
    attempt.id === attemptId ? update : attempt,
  );
}

export function reducePlaybackSession(
  currentSession: PlaybackSession,
  rawEvent: PlaybackSessionEvent,
): PlaybackSession {
  const session = playbackSessionSchema.parse(currentSession);
  const event = playbackSessionEventSchema.parse(rawEvent);

  assertSessionRule(
    event.sessionId === session.id,
    "Playback session event targets a different session.",
  );

  const existingEvent = session.eventLog.find((item) => item.id === event.id);
  if (existingEvent) {
    assertSessionRule(
      JSON.stringify(existingEvent) === JSON.stringify(event),
      "Playback session event id was reused with different data.",
    );
    return session;
  }

  assertEventOrder(session, event);
  assertSessionRule(
    !TERMINAL_STATUSES.has(session.status),
    "Terminal playback sessions cannot accept new events.",
  );

  let nextSession: PlaybackSession = {
    ...session,
    updatedAt: event.at,
    eventLog: [...session.eventLog, event],
  };

  switch (event.type) {
    case "session_created": {
      assertSessionRule(
        session.eventLog.length === 0,
        "session_created must be the first session event.",
      );
      assertSessionRule(
        event.action === session.action,
        "session_created action must match the session action.",
      );
      break;
    }

    case "status_changed": {
      assertSessionRule(
        event.from === session.status,
        "status_changed.from must match the current session status.",
      );
      assertSessionRule(
        event.to !== event.from,
        "status_changed must move to a different status.",
      );
      assertSessionRule(
        !TERMINAL_STATUSES.has(event.to),
        "Use a terminal session event instead of status_changed.",
      );
      nextSession.status = event.to;
      break;
    }

    case "candidate_selected": {
      findCandidate(session, event.candidateId);
      nextSession.selectedCandidateId = event.candidateId;
      nextSession.status = "selecting_candidate";
      break;
    }

    case "attempt_started": {
      const candidate = findCandidate(session, event.candidateId);
      assertSessionRule(
        session.selectedCandidateId === event.candidateId,
        "An attempt can only start for the selected candidate.",
      );
      assertSessionRule(
        !session.attempts.some((attempt) => attempt.id === event.attemptId),
        "Attempt id already exists in the session.",
      );
      nextSession.attempts = [
        ...session.attempts,
        {
          id: event.attemptId,
          candidateId: event.candidateId,
          sourceType: candidate.sourceType,
          status: "attempting",
          startedAt: event.at,
        },
      ];
      nextSession.status = "attempting_candidate";
      break;
    }

    case "attempt_ready": {
      const attempt = findAttempt(session, event.attemptId);
      assertSessionRule(
        attempt.candidateId === event.candidateId,
        "attempt_ready candidate must match the referenced attempt.",
      );
      assertSessionRule(
        attempt.status === "attempting" || attempt.status === "pending",
        "Only pending or attempting attempts can become ready.",
      );
      nextSession.attempts = replaceAttempt(session, attempt.id, {
        ...attempt,
        status: "ready",
        endedAt: event.at,
        error: undefined,
      });
      nextSession.status = "ready";
      break;
    }

    case "attempt_failed": {
      const attempt = findAttempt(session, event.attemptId);
      assertSessionRule(
        attempt.candidateId === event.candidateId,
        "attempt_failed candidate must match the referenced attempt.",
      );
      assertSessionRule(
        attempt.status === "attempting" ||
          attempt.status === "pending" ||
          attempt.status === "ready",
        "Only pending, attempting, or ready attempts can fail.",
      );
      nextSession.attempts = replaceAttempt(session, attempt.id, {
        ...attempt,
        status: "failed",
        endedAt: event.at,
        error: event.error,
      });
      break;
    }

    case "attempt_skipped": {
      const candidate = findCandidate(session, event.candidateId);
      const existingAttempt = session.attempts.find(
        (attempt) => attempt.id === event.attemptId,
      );
      assertSessionRule(
        !existingAttempt || existingAttempt.candidateId === event.candidateId,
        "attempt_skipped candidate must match the referenced attempt.",
      );
      assertSessionRule(
        !existingAttempt ||
          existingAttempt.status === "pending" ||
          existingAttempt.status === "attempting",
        "Only pending or attempting attempts can be skipped.",
      );

      const skippedAttempt = {
        ...(existingAttempt || {
          id: event.attemptId,
          candidateId: event.candidateId,
          sourceType: candidate.sourceType,
        }),
        status: "skipped" as const,
        endedAt: event.at,
      };
      nextSession.attempts = existingAttempt
        ? replaceAttempt(session, existingAttempt.id, skippedAttempt)
        : [...session.attempts, skippedAttempt];
      break;
    }

    case "gateway_job_attached": {
      findCandidate(session, event.candidateId);
      assertSessionRule(
        session.selectedCandidateId === event.candidateId,
        "A gateway job can only attach to the selected candidate.",
      );
      nextSession.gatewayJobId = event.gatewayJobId;
      nextSession.status = "creating_gateway_job";
      break;
    }

    case "gateway_progress": {
      assertSessionRule(
        session.gatewayJobId === event.gatewayJobId,
        "Gateway progress must reference the attached gateway job.",
      );
      const status = statusForGatewayPhase(event.phase);
      if (status) nextSession.status = status;
      break;
    }

    case "fallback_started": {
      findCandidate(session, event.fromCandidateId);
      findCandidate(session, event.toCandidateId);
      assertSessionRule(
        event.fromCandidateId !== event.toCandidateId,
        "Fallback must move to a different candidate.",
      );
      assertSessionRule(
        session.selectedCandidateId === event.fromCandidateId,
        "Fallback source must match the selected candidate.",
      );
      nextSession.selectedCandidateId = event.toCandidateId;
      nextSession.gatewayJobId = undefined;
      nextSession.status = "trying_fallback";
      break;
    }

    case "session_failed": {
      nextSession.status = "failed";
      nextSession.terminalError = event.error;
      break;
    }

    case "session_cancelled": {
      nextSession.status = "cancelled";
      nextSession.gatewayJobId = undefined;
      break;
    }

    case "session_completed": {
      nextSession.status = "completed";
      nextSession.gatewayJobId = undefined;
      break;
    }
  }

  return playbackSessionSchema.parse(nextSession);
}
