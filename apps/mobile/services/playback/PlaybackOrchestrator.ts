import type {
  DeviceProfile,
  PlaybackPlan,
  PlaybackRuntimeError,
  PlaybackRuntimeState,
  PlaybackSessionCastProfile,
  Stream,
} from "@streamer/shared";
import type { MediaInfo } from "../../stores/playerStore";
import { usePlaybackSessionStore } from "../../stores/playbackSessionStore";
import type { DownloadEligibility } from "../downloadEligibility";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";
import { createPlaybackPlanWithBridgeRetry } from "./PlaybackPlanService";
import {
  resolveCastSession,
  resolveDownloadSession,
} from "./PlaybackSessionPlaybackService";
import {
  getCastSessionProfile,
  getChromecastDeviceProfile,
  getDeviceProfile,
} from "./deviceProfile";
import {
  createPlaybackRuntimeError,
  getPlaybackRuntimeState,
  mapPlaybackPlanToRuntimeFailure,
} from "./PlaybackErrors";
import { addMobileBreadcrumb } from "../sentryBreadcrumbs";

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
  sessionId: string;
  candidateId: string;
  attemptId: string;
  runtimeState: PlaybackRuntimeState;
  plan: PlaybackPlan;
  attemptedStreams: number;
  resolveErrors: string[];
}

export type CastOrchestratorResult =
  | CastOrchestratorSuccess
  | PlaybackOrchestratorFailure;

export interface PrepareCastOptions {
  deviceProfile?: DeviceProfile;
  castProfile?: PlaybackSessionCastProfile;
}

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
  recordSessionStarted("play", input, session.id, plan, bridgeDiagnostics);

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

/**
 * Starts a viewer-selected planner candidate without exposing or resolving a
 * raw URI in the UI. The opaque planner id is mapped into a fresh playback
 * session, after which the normal session resolver owns preparation and
 * fallback behavior.
 */
export async function playCandidate(
  input: PlaybackOrchestratorInput,
  plan: PlaybackPlan,
  plannerCandidateId: string,
): Promise<PlaybackOrchestratorResult> {
  const candidate = plan.orderedCandidates.find(
    (item) => item.id === plannerCandidateId && item.actionEligibility.eligible,
  );
  if (plan.action !== "play" || !candidate) {
    const error = createPlaybackRuntimeError(
      "SOURCE_UNAVAILABLE",
      "That source is no longer available. Choose another source.",
      { retryable: true, shouldFallback: false },
    );
    return {
      ok: false,
      error,
      runtimeState: getPlaybackRuntimeState(error.code),
      plan,
      attemptedStreams: 0,
      resolveErrors: [],
    };
  }

  const bridgeDiagnostics = streamEngineManager.getBridgeDiagnostics();
  const store = usePlaybackSessionStore.getState();
  const session = store.createSession({
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
  recordSessionStarted("play", input, session.id, plan, bridgeDiagnostics);

  const sessionCandidate = session.candidates.find(
    (item) =>
      store.getRuntimeCandidate(session.id, item.id)?.id === plannerCandidateId,
  );
  if (!sessionCandidate) {
    const error = createPlaybackRuntimeError(
      "SOURCE_UNAVAILABLE",
      "That source needs to be prepared again.",
      { retryable: true, shouldFallback: false },
    );
    store.failSession(session.id, error);
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

  if (session.selectedCandidateId !== sessionCandidate.id) {
    store.dispatchPlaybackEvent(session.id, {
      type: "candidate_selected",
      candidateId: sessionCandidate.id,
      reason: "Source selected by the viewer.",
    });
  }

  return {
    ok: true,
    stream: candidate.stream,
    mediaInfo: buildMediaInfo(input, candidate.stream),
    sessionId: session.id,
    candidateId: sessionCandidate.id,
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
  recordSessionStarted("download", input, session.id, plan, bridgeDiagnostics);

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
  options: PrepareCastOptions = {},
): Promise<CastOrchestratorResult> {
  const fallback = "Casting is unavailable right now.";
  const deviceProfile = options.deviceProfile ?? getChromecastDeviceProfile();
  const castProfile =
    options.castProfile ?? getCastSessionProfile(deviceProfile);
  const plan = await createPlaybackPlanWithBridgeRetry({
    type: input.type,
    id: input.id,
    season: input.season,
    episode: input.episode,
    action: "cast",
    deviceProfile,
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
    deviceProfile,
    bridge: {
      status: bridgeDiagnostics.status,
      reason: bridgeDiagnostics.reason,
    },
    castProfile,
  });
  recordSessionStarted("cast", input, session.id, plan, bridgeDiagnostics);

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

  const result = await resolveCastSession(session.id, candidateId);
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
    sessionId: session.id,
    candidateId: result.candidateId,
    attemptId: result.attemptId,
    runtimeState: "selecting_source",
    plan,
    attemptedStreams: attempts.length,
    resolveErrors,
  };
}

function recordSessionStarted(
  action: "play" | "download" | "cast",
  input: PlaybackOrchestratorInput,
  sessionId: string,
  plan: PlaybackPlan,
  bridgeDiagnostics: ReturnType<
    typeof streamEngineManager.getBridgeDiagnostics
  >,
) {
  addMobileBreadcrumb({
    category: "playback",
    message: "playback.session_started",
    data: {
      action,
      sessionId,
      contentType: input.type,
      hasEpisode: input.season !== undefined || input.episode !== undefined,
      season: input.season,
      episode: input.episode,
      planState: plan.state,
      candidateCount:
        plan.orderedCandidates?.length ??
        (plan.selectedCandidate
          ? 1 + (plan.fallbackCandidates?.length ?? 0)
          : 0),
      selectedCandidateKind: plan.selectedCandidate?.kind,
      selectedRequiresBridge: plan.selectedCandidate?.requiresBridge,
      selectedRequiresRemux: plan.selectedCandidate?.requiresRemux,
      bridgeStatus: bridgeDiagnostics.status,
      bridgeReason: bridgeDiagnostics.reason,
    },
  });
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
