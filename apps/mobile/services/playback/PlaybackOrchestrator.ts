import type {
  PlaybackPlan,
  PlaybackRuntimeError,
  PlaybackRuntimeState,
  Stream,
} from "@streamer/shared";
import type { MediaInfo } from "../../stores/playerStore";
import { usePlaybackSessionStore } from "../../stores/playbackSessionStore";
import type { DownloadEligibility } from "../downloadEligibility";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";
import {
  createPlaybackPlanWithBridgeRetry,
  resolvePlaybackPlan,
} from "./PlaybackPlanService";
import { resolveDownloadSession } from "./PlaybackSessionPlaybackService";
import { getDeviceProfile } from "./deviceProfile";
import {
  createPlaybackRuntimeError,
  getPlaybackRuntimeState,
  mapPlaybackPlanToRuntimeFailure,
  mapResolveErrorsToRuntimeFailure,
} from "./PlaybackErrors";

export interface PlaybackOrchestratorInput {
  type: "movie" | "series";
  id: string;
  title?: string;
  poster?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

export interface PlaybackOrchestratorSuccess {
  ok: true;
  stream: Stream;
  mediaInfo: MediaInfo;
  sessionId: string;
  candidateId: string;
  runtimeState: PlaybackRuntimeState;
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

export interface PlaybackOrchestratorFailure {
  ok: false;
  error: PlaybackRuntimeError;
  runtimeState: PlaybackRuntimeState;
  plan?: PlaybackPlan;
  sessionId?: string;
  attemptedStreams: number;
  resolveErrors: string[];
}

export type PlaybackOrchestratorResult =
  | PlaybackOrchestratorSuccess
  | PlaybackOrchestratorFailure;

interface ResolvedActionSuccess {
  ok: true;
  stream: Stream;
  uri: string;
  remainingStreams: Stream[];
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

type ResolvedActionResult = ResolvedActionSuccess | PlaybackOrchestratorFailure;

export interface DownloadOrchestratorSuccess {
  ok: true;
  stream: Stream;
  resolvedUrl: string;
  mediaInfo: MediaInfo;
  eligibility: DownloadEligibility;
  sessionId: string;
  candidateId: string;
  attemptId: string;
  runtimeState: PlaybackRuntimeState;
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

export type DownloadOrchestratorResult =
  | DownloadOrchestratorSuccess
  | PlaybackOrchestratorFailure;

export interface CastOrchestratorSuccess {
  ok: true;
  stream: Stream;
  resolvedUrl: string;
  mediaInfo: MediaInfo;
  runtimeState: PlaybackRuntimeState;
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

export type CastOrchestratorResult =
  | CastOrchestratorSuccess
  | PlaybackOrchestratorFailure;

export async function playBest(
  input: PlaybackOrchestratorInput,
): Promise<PlaybackOrchestratorResult> {
  const fallback = "Playback is unavailable right now.";
  const plan = await createPlaybackPlanWithBridgeRetry({
    type: input.type,
    id: input.id,
    season: input.season,
    episode: input.episode,
    action: "play",
  });
  const bridgeDiagnostics = streamEngineManager.getBridgeDiagnostics();
  const session = usePlaybackSessionStore.getState().createSession({
    plan,
    content: {
      type: input.type,
      id: input.id,
      season: input.season,
      episode: input.episode,
    },
    deviceProfile: getDeviceProfile(),
    bridge: {
      status: bridgeDiagnostics.status,
      reason: bridgeDiagnostics.reason,
    },
  });

  if (plan.state !== "ready" || !plan.selectedCandidate) {
    const failure = mapPlaybackPlanToRuntimeFailure(plan, fallback);
    usePlaybackSessionStore.getState().failSession(session.id, failure.error);
    return {
      ok: false,
      ...failure,
      plan,
      sessionId: session.id,
      attemptedStreams: 0,
      resolveErrors: [],
    };
  }

  const candidateId = session.selectedCandidateId;
  if (!candidateId) {
    const error = createPlaybackRuntimeError("SOURCE_UNAVAILABLE", fallback, {
      retryable: true,
      shouldFallback: false,
    });
    usePlaybackSessionStore.getState().failSession(session.id, error);
    return {
      ok: false,
      error,
      runtimeState: getPlaybackRuntimeState(error.code),
      plan,
      sessionId: session.id,
      attemptedStreams: 0,
      resolveErrors: [],
    };
  }

  return {
    ok: true,
    stream: plan.selectedCandidate.stream,
    mediaInfo: buildMediaInfo(input, plan.selectedCandidate.stream),
    sessionId: session.id,
    candidateId,
    runtimeState: "selecting_source",
    plan,
    attemptedStreams: 0,
    resolveErrors: [],
  };
}

export async function prepareDownload(
  input: PlaybackOrchestratorInput,
): Promise<DownloadOrchestratorResult> {
  const fallback = "Download is unavailable right now.";
  const plan = await createPlaybackPlanWithBridgeRetry({
    type: input.type,
    id: input.id,
    season: input.season,
    episode: input.episode,
    action: "download",
  });
  const bridgeDiagnostics = streamEngineManager.getBridgeDiagnostics();
  const session = usePlaybackSessionStore.getState().createSession({
    plan,
    content: {
      type: input.type,
      id: input.id,
      season: input.season,
      episode: input.episode,
    },
    deviceProfile: getDeviceProfile(),
    bridge: {
      status: bridgeDiagnostics.status,
      reason: bridgeDiagnostics.reason,
    },
  });

  if (plan.state !== "ready" || !plan.selectedCandidate) {
    const failure = mapPlaybackPlanToRuntimeFailure(plan, fallback);
    usePlaybackSessionStore.getState().failSession(session.id, failure.error);
    return {
      ok: false,
      ...failure,
      plan,
      sessionId: session.id,
      attemptedStreams: 0,
      resolveErrors: [],
    };
  }

  const candidateId = session.selectedCandidateId;
  if (!candidateId) {
    const error = createPlaybackRuntimeError("SOURCE_UNAVAILABLE", fallback, {
      retryable: true,
      shouldFallback: false,
    });
    usePlaybackSessionStore.getState().failSession(session.id, error);
    return {
      ok: false,
      error,
      runtimeState: getPlaybackRuntimeState(error.code),
      plan,
      sessionId: session.id,
      attemptedStreams: 0,
      resolveErrors: [],
    };
  }

  const result = await resolveDownloadSession(session.id, candidateId);
  const attempts =
    usePlaybackSessionStore.getState().sessions[session.id]?.attempts || [];
  const resolveErrors = attempts
    .map((attempt) => attempt.error?.message)
    .filter((message): message is string => !!message);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      runtimeState: getPlaybackRuntimeState(result.error.code),
      plan,
      sessionId: session.id,
      attemptedStreams: attempts.length,
      resolveErrors,
    };
  }

  return {
    ok: true,
    stream: result.stream,
    resolvedUrl: result.uri,
    mediaInfo: buildMediaInfo(input, result.stream),
    eligibility: result.eligibility,
    sessionId: session.id,
    candidateId: result.candidateId,
    attemptId: result.attemptId,
    runtimeState: "selecting_source",
    plan,
    attemptedStreams: attempts.length,
    resolveErrors,
  };
}

export async function prepareCast(
  input: PlaybackOrchestratorInput,
): Promise<CastOrchestratorResult> {
  const fallback = "Casting is unavailable right now.";
  const result = await resolveActionPlan(input, "cast", fallback);

  if (!result.ok) return result;

  return {
    ok: true,
    stream: result.stream,
    resolvedUrl: result.uri,
    mediaInfo: buildMediaInfo(input, result.stream),
    runtimeState: "buffering",
    plan: result.plan,
    attemptedStreams: result.attemptedStreams,
    resolveErrors: result.resolveErrors,
  };
}

async function resolveActionPlan(
  input: PlaybackOrchestratorInput,
  action: "play" | "download" | "cast",
  fallback: string,
): Promise<ResolvedActionResult> {
  const plan = await createPlaybackPlanWithBridgeRetry({
    type: input.type,
    id: input.id,
    season: input.season,
    episode: input.episode,
    action,
  });

  if (plan.state !== "ready") {
    const failure = mapPlaybackPlanToRuntimeFailure(plan, fallback);
    return {
      ok: false,
      ...failure,
      plan,
      attemptedStreams: 0,
      resolveErrors: [],
    };
  }

  const result = await resolvePlaybackPlan(plan);
  if (!result.resolved) {
    const failure =
      result.errors.length > 0
        ? mapResolveErrorsToRuntimeFailure(result.errors, fallback)
        : mapPlaybackPlanToRuntimeFailure(plan, fallback);

    return {
      ok: false,
      ...failure,
      plan,
      attemptedStreams: result.attemptedStreams,
      resolveErrors: result.errors,
    };
  }

  return {
    ok: true,
    stream: result.resolved.stream,
    uri: result.resolved.uri,
    remainingStreams: result.remainingStreams,
    plan,
    attemptedStreams: result.attemptedStreams,
    resolveErrors: result.errors,
  };
}

function buildMediaInfo(
  input: PlaybackOrchestratorInput,
  stream: Stream,
): MediaInfo {
  const title = input.episodeTitle
    ? `${input.title || stream.title || "Unknown"} - ${input.episodeTitle}`
    : (input.title ?? stream.title ?? "Unknown");

  return {
    type: input.type,
    itemId: input.id,
    title,
    poster: input.poster,
    season: input.season,
    episode: input.episode,
  };
}
