import type {
  PlaybackGatewayPhase,
  PlaybackRuntimeError,
  PlaybackSession,
  PlaybackSessionStatus,
  PlannedMediaCandidate,
  Stream,
} from "@streamer/shared";
import { usePlaybackSessionStore } from "../../stores/playbackSessionStore";
import {
  getDownloadEligibility,
  type DownloadEligibility,
} from "../downloadEligibility";
import type {
  GatewayJobProgress,
  IStreamEngine,
} from "../streamEngine/IStreamEngine";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";
import { getUnsupportedWebCodecReason } from "../streamEngine/codecSupport";
import {
  createPlaybackRuntimeError,
  inferPlaybackErrorCodeFromMessages,
} from "./PlaybackErrors";
import { toPlaybackSessionError } from "./PlaybackSessionReducer";
import { addMobileBreadcrumb } from "../sentryBreadcrumbs";

const TERMINAL_STATUSES = new Set<PlaybackSessionStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const activeEngineBySession = new Map<string, IStreamEngine>();
const resolutionBySession = new Map<
  string,
  Promise<PlaybackSessionInternalResolutionResult>
>();
const lastGatewayBreadcrumbPhaseBySession = new Map<string, string>();

export interface PlaybackSessionResolutionSuccess {
  ok: true;
  sessionId: string;
  candidateId: string;
  attemptId: string;
  stream: Stream;
  uri: string;
  fallbackReason?: string;
}

export interface PlaybackSessionResolutionFailure {
  ok: false;
  sessionId: string;
  error: PlaybackRuntimeError;
}

export type PlaybackSessionResolutionResult =
  | PlaybackSessionResolutionSuccess
  | PlaybackSessionResolutionFailure;

export interface PlaybackSessionDownloadResolutionSuccess extends PlaybackSessionResolutionSuccess {
  eligibility: DownloadEligibility;
}

export type PlaybackSessionDownloadResolutionResult =
  | PlaybackSessionDownloadResolutionSuccess
  | PlaybackSessionResolutionFailure;

interface PlaybackSessionInternalResolutionSuccess extends PlaybackSessionResolutionSuccess {
  eligibility?: DownloadEligibility;
}

type PlaybackSessionInternalResolutionResult =
  | PlaybackSessionInternalResolutionSuccess
  | PlaybackSessionResolutionFailure;

type SessionResolutionAction = "play" | "download" | "cast";

class PlaybackResolutionTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaybackResolutionTimeoutError";
  }
}

class DownloadEligibilityError extends Error {
  constructor(readonly eligibility: DownloadEligibility) {
    super(
      eligibility.reason ||
        "This source cannot be saved for verified offline playback.",
    );
    this.name = "DownloadEligibilityError";
  }
}

function getSession(sessionId: string) {
  return usePlaybackSessionStore.getState().sessions[sessionId] || null;
}

function isTerminal(session: PlaybackSession | null) {
  return !!session && TERMINAL_STATUSES.has(session.status);
}

function runtimeErrorFromSession(
  session: PlaybackSession,
): PlaybackRuntimeError {
  if (session.terminalError) {
    return {
      ...session.terminalError,
    };
  }

  if (session.status === "cancelled") {
    return createPlaybackRuntimeError(
      "SOURCE_UNAVAILABLE",
      getActionMessage(session.action, {
        play: "Playback was cancelled.",
        download: "Download was cancelled.",
        cast: "Casting was cancelled.",
      }),
      {
        retryable: true,
        shouldFallback: false,
      },
    );
  }

  return createPlaybackRuntimeError("SOURCE_UNAVAILABLE", undefined, {
    retryable: true,
    shouldFallback: false,
  });
}

function getActionMessage(
  action: SessionResolutionAction,
  messages: Record<SessionResolutionAction, string>,
) {
  return messages[action];
}

function toSafeRuntimeError(
  error: unknown,
  candidate: PlannedMediaCandidate | null,
  shouldFallback: boolean,
): PlaybackRuntimeError {
  if (error instanceof DownloadEligibilityError) {
    const code =
      error.eligibility.mode === "bridge-torrent"
        ? "BRIDGE_UNAVAILABLE"
        : "SOURCE_UNAVAILABLE";
    return createPlaybackRuntimeError(code, error.message, {
      retryable: error.eligibility.mode === "bridge-torrent",
      shouldFallback,
    });
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const fallbackCode =
    candidate?.requiresBridge || candidate?.kind === "torrent"
      ? "BRIDGE_UNAVAILABLE"
      : "SOURCE_UNAVAILABLE";
  const code =
    error instanceof PlaybackResolutionTimeoutError
      ? candidate?.requiresBridge || candidate?.kind === "torrent"
        ? "GATEWAY_TIMEOUT"
        : "PLAYBACK_TIMEOUT"
      : inferPlaybackErrorCodeFromMessages([rawMessage]) || fallbackCode;

  return createPlaybackRuntimeError(code, undefined, {
    retryable: true,
    shouldFallback,
    debugMessage: rawMessage || undefined,
  });
}

function dispatchSessionStatus(
  sessionId: string,
  to: PlaybackSessionStatus,
  reason?: string,
) {
  const session = getSession(sessionId);
  if (!session || isTerminal(session) || session.status === to) return session;

  return usePlaybackSessionStore.getState().dispatchPlaybackEvent(sessionId, {
    type: "status_changed",
    from: session.status,
    to,
    reason,
  });
}

function getCandidateStream(
  sessionId: string,
  candidate: PlannedMediaCandidate,
): Stream {
  const plan = usePlaybackSessionStore.getState().getRuntimePlan(sessionId);
  const playbackUrl =
    plan?.plan?.selectedCandidate.id === candidate.id
      ? plan.plan.playbackUrl
      : undefined;

  return playbackUrl
    ? {
        ...candidate.stream,
        url: playbackUrl,
      }
    : candidate.stream;
}

function requireOfflineDownloadEligibility(stream: Stream) {
  const eligibility = getDownloadEligibility(stream);
  if (!eligibility.canDownload || !eligibility.offlinePlayable) {
    throw new DownloadEligibilityError(eligibility);
  }
  return eligibility;
}

function getRemainingBudgetMs(session: PlaybackSession) {
  const deadline = Date.parse(session.createdAt) + session.timeoutBudgetMs;
  return Math.max(0, deadline - Date.now());
}

function getCandidateTimeoutMs(
  session: PlaybackSession,
  candidate: PlannedMediaCandidate,
) {
  const plan = usePlaybackSessionStore.getState().getRuntimePlan(session.id);
  const timeoutBudget = plan?.timeoutBudget;
  const remainingMs = getRemainingBudgetMs(session);
  if (!timeoutBudget) return remainingMs;

  let candidateBudgetMs =
    candidate.kind === "hls"
      ? timeoutBudget.hlsProbeMs
      : timeoutBudget.directProbeMs;

  if (candidate.requiresBridge || candidate.kind === "torrent") {
    candidateBudgetMs =
      timeoutBudget.bridgeConnectMs +
      timeoutBudget.torrentMetadataMs +
      timeoutBudget.peerDiscoveryMs +
      (candidate.requiresRemux ? timeoutBudget.remuxReadyMs : 0);
  }

  return Math.min(candidateBudgetMs, remainingMs);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  if (timeoutMs <= 0) {
    return Promise.reject(new PlaybackResolutionTimeoutError(message));
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PlaybackResolutionTimeoutError(message)),
      timeoutMs,
    );

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function stopActiveEngine(sessionId: string) {
  const engine = activeEngineBySession.get(sessionId);
  activeEngineBySession.delete(sessionId);
  engine?.stop?.();
}

function clearSessionBreadcrumbState(sessionId: string) {
  for (const key of lastGatewayBreadcrumbPhaseBySession.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      lastGatewayBreadcrumbPhaseBySession.delete(key);
    }
  }
}

function recordGatewayEvent(
  sessionId: string,
  candidateId: string,
  progress: GatewayJobProgress,
) {
  const session = getSession(sessionId);
  if (
    !session ||
    isTerminal(session) ||
    session.selectedCandidateId !== candidateId
  ) {
    return;
  }

  if (!progress.id) {
    if (progress.phase === "creating_gateway_job") {
      dispatchSessionStatus(sessionId, "creating_gateway_job");
    }
    return;
  }

  let current = getSession(sessionId);
  if (!current || isTerminal(current)) return;

  if (current.gatewayJobId !== progress.id) {
    usePlaybackSessionStore.getState().dispatchPlaybackEvent(sessionId, {
      type: "gateway_job_attached",
      gatewayJobId: progress.id,
      candidateId,
    });
    current = getSession(sessionId);
  }

  if (!progress.phase || !current || isTerminal(current)) return;

  const breadcrumbKey = `${sessionId}:${candidateId}:${progress.id}`;
  const lastPhase = lastGatewayBreadcrumbPhaseBySession.get(breadcrumbKey);
  if (lastPhase !== progress.phase) {
    lastGatewayBreadcrumbPhaseBySession.set(breadcrumbKey, progress.phase);
    addMobileBreadcrumb({
      category: "gateway",
      message: "gateway.job_phase_changed",
      data: {
        sessionId,
        candidateId,
        gatewayJobId: progress.id,
        phase: progress.phase,
        state: progress.state,
        peerCount: progress.peerCount,
        progress:
          typeof progress.progress === "number"
            ? Math.round(progress.progress * 100) / 100
            : undefined,
      },
    });
  }

  usePlaybackSessionStore
    .getState()
    .recordGatewayProgress(
      sessionId,
      progress.id,
      progress.phase as PlaybackGatewayPhase,
      progress.progress ?? undefined,
      progress.peerCount ?? undefined,
    );
}

function selectCandidate(
  sessionId: string,
  candidateId: string,
  reason?: string,
) {
  const session = getSession(sessionId);
  if (
    !session ||
    isTerminal(session) ||
    session.selectedCandidateId === candidateId
  ) {
    return;
  }

  if (session.selectedCandidateId) {
    usePlaybackSessionStore
      .getState()
      .recordFallback(
        sessionId,
        session.selectedCandidateId,
        candidateId,
        reason || "Trying another source automatically.",
      );
    addMobileBreadcrumb({
      category: "playback",
      message: "playback.fallback_triggered",
      level: "warning",
      data: {
        sessionId,
        fromCandidateId: session.selectedCandidateId,
        toCandidateId: candidateId,
        reason,
      },
    });
    return;
  }

  usePlaybackSessionStore.getState().dispatchPlaybackEvent(sessionId, {
    type: "candidate_selected",
    candidateId,
    reason,
  });
}

async function attemptCandidate(
  sessionId: string,
  candidateId: string,
  hasFallback: boolean,
  action: SessionResolutionAction,
): Promise<PlaybackSessionInternalResolutionResult> {
  const store = usePlaybackSessionStore.getState();
  const session = getSession(sessionId);
  const candidate = store.getRuntimeCandidate(sessionId, candidateId);

  if (!session || !candidate) {
    const error = createPlaybackRuntimeError(
      "SOURCE_UNAVAILABLE",
      getActionMessage(action, {
        play: "Playback needs to be prepared again.",
        download: "Download needs to be prepared again.",
        cast: "Casting needs to be prepared again.",
      }),
      { retryable: true, shouldFallback: false },
    );
    if (session && !isTerminal(session)) store.failSession(sessionId, error);
    return { ok: false, sessionId, error };
  }

  const attempt = store.startAttempt(sessionId, candidateId);
  const stream = getCandidateStream(sessionId, candidate);
  const unsupportedCodecReason = getUnsupportedWebCodecReason(stream);
  addMobileBreadcrumb({
    category: "playback",
    message: "playback.candidate_attempted",
    data: {
      sessionId,
      action,
      candidateId,
      attemptId: attempt.id,
      candidateRank: candidate.rank,
      candidateKind: candidate.kind,
      requiresBridge: candidate.requiresBridge,
      requiresRemux: candidate.requiresRemux,
      hasFallback,
    },
  });

  if (action === "download") {
    try {
      requireOfflineDownloadEligibility(stream);
    } catch (error) {
      const runtimeError = toSafeRuntimeError(error, candidate, hasFallback);
      store.dispatchPlaybackEvent(sessionId, {
        type: "attempt_failed",
        attemptId: attempt.id,
        candidateId,
        error: toPlaybackSessionError(runtimeError),
      });
      addMobileBreadcrumb({
        category: "playback",
        message: "playback.candidate_failed",
        level: "warning",
        data: {
          sessionId,
          action,
          candidateId,
          attemptId: attempt.id,
          code: runtimeError.code,
          shouldFallback: runtimeError.shouldFallback,
        },
      });
      return { ok: false, sessionId, error: runtimeError };
    }
  }

  if (action !== "cast" && unsupportedCodecReason) {
    const error = createPlaybackRuntimeError("UNSUPPORTED_CODEC", undefined, {
      retryable: false,
      shouldFallback: hasFallback,
      debugMessage: unsupportedCodecReason,
    });
    store.dispatchPlaybackEvent(sessionId, {
      type: "attempt_failed",
      attemptId: attempt.id,
      candidateId,
      error: toPlaybackSessionError(error),
    });
    addMobileBreadcrumb({
      category: "playback",
      message: "playback.candidate_failed",
      level: "warning",
      data: {
        sessionId,
        action,
        candidateId,
        attemptId: attempt.id,
        code: error.code,
        shouldFallback: error.shouldFallback,
      },
    });
    return { ok: false, sessionId, error };
  }

  const engine = streamEngineManager.resolveEngine(stream);
  if (!engine) {
    const error = createPlaybackRuntimeError("SOURCE_UNAVAILABLE", undefined, {
      retryable: true,
      shouldFallback: hasFallback,
    });
    store.dispatchPlaybackEvent(sessionId, {
      type: "attempt_failed",
      attemptId: attempt.id,
      candidateId,
      error: toPlaybackSessionError(error),
    });
    addMobileBreadcrumb({
      category: "playback",
      message: "playback.candidate_failed",
      level: "warning",
      data: {
        sessionId,
        action,
        candidateId,
        attemptId: attempt.id,
        code: error.code,
        shouldFallback: error.shouldFallback,
      },
    });
    return { ok: false, sessionId, error };
  }

  stopActiveEngine(sessionId);
  activeEngineBySession.set(sessionId, engine);

  if (candidate.requiresBridge || candidate.kind === "torrent") {
    dispatchSessionStatus(sessionId, "checking_bridge");
  } else {
    dispatchSessionStatus(sessionId, "probing_playback_url");
  }

  const onGateway = (progress: GatewayJobProgress) =>
    recordGatewayEvent(sessionId, candidateId, progress);
  engine.on("gateway", onGateway);

  try {
    const currentSession = getSession(sessionId);
    if (!currentSession || isTerminal(currentSession)) {
      return {
        ok: false,
        sessionId,
        error: currentSession
          ? runtimeErrorFromSession(currentSession)
          : createPlaybackRuntimeError("SOURCE_UNAVAILABLE"),
      };
    }

    const timeoutMs = getCandidateTimeoutMs(currentSession, candidate);
    const uri = await withTimeout(
      engine.getPlaybackUri(stream),
      timeoutMs,
      getActionMessage(action, {
        play: "Playback source preparation timed out.",
        download: "Download source preparation timed out.",
        cast: "Cast source preparation timed out.",
      }),
    );
    const latestSession = getSession(sessionId);
    if (!latestSession || isTerminal(latestSession)) {
      return {
        ok: false,
        sessionId,
        error: latestSession
          ? runtimeErrorFromSession(latestSession)
          : createPlaybackRuntimeError("SOURCE_UNAVAILABLE"),
      };
    }

    if (!uri || uri.length === 0) {
      if (candidate.requiresBridge || candidate.kind === "torrent") {
        if (streamEngineManager.bridgeStatus === "unsupported") {
          throw new Error("Torrent engine unavailable.");
        }
        if (streamEngineManager.bridgeStatus === "no-peers") {
          throw new Error("No peers found.");
        }
        throw new Error("Desktop bridge unavailable.");
      }
      throw new Error("Source did not return a playback URL.");
    }

    const resolvedStream =
      stream.url === uri ? stream : { ...stream, url: uri };
    const eligibility =
      action === "download"
        ? requireOfflineDownloadEligibility(resolvedStream)
        : undefined;

    store.dispatchPlaybackEvent(sessionId, {
      type: "attempt_ready",
      attemptId: attempt.id,
      candidateId,
    });
    addMobileBreadcrumb({
      category: "playback",
      message: "playback.candidate_ready",
      data: {
        sessionId,
        action,
        candidateId,
        attemptId: attempt.id,
        candidateKind: candidate.kind,
        requiresBridge: candidate.requiresBridge,
        requiresRemux: candidate.requiresRemux,
      },
    });

    return {
      ok: true,
      sessionId,
      candidateId,
      attemptId: attempt.id,
      stream: resolvedStream,
      uri,
      eligibility,
    };
  } catch (error) {
    const latestSession = getSession(sessionId);
    if (!latestSession || isTerminal(latestSession)) {
      return {
        ok: false,
        sessionId,
        error: latestSession
          ? runtimeErrorFromSession(latestSession)
          : createPlaybackRuntimeError("SOURCE_UNAVAILABLE"),
      };
    }

    const runtimeError = toSafeRuntimeError(error, candidate, hasFallback);
    store.dispatchPlaybackEvent(sessionId, {
      type: "attempt_failed",
      attemptId: attempt.id,
      candidateId,
      error: toPlaybackSessionError(runtimeError),
    });
    addMobileBreadcrumb({
      category: "playback",
      message: "playback.candidate_failed",
      level: "warning",
      data: {
        sessionId,
        action,
        candidateId,
        attemptId: attempt.id,
        code: runtimeError.code,
        shouldFallback: runtimeError.shouldFallback,
      },
    });
    stopActiveEngine(sessionId);
    return { ok: false, sessionId, error: runtimeError };
  } finally {
    engine.off("gateway", onGateway);
  }
}

async function resolveCandidateChain(
  sessionId: string,
  action: SessionResolutionAction,
  startCandidateId?: string,
  initialFallbackReason?: string,
): Promise<PlaybackSessionInternalResolutionResult> {
  const store = usePlaybackSessionStore.getState();
  const session = getSession(sessionId);
  if (!session) {
    return {
      ok: false,
      sessionId,
      error: createPlaybackRuntimeError("SOURCE_UNAVAILABLE"),
    };
  }
  if (session.action !== action) {
    const error = createPlaybackRuntimeError(
      "SOURCE_UNAVAILABLE",
      `This session cannot be used for ${action}.`,
      { retryable: false, shouldFallback: false },
    );
    if (!isTerminal(session)) store.failSession(sessionId, error);
    return { ok: false, sessionId, error };
  }
  if (isTerminal(session)) {
    return { ok: false, sessionId, error: runtimeErrorFromSession(session) };
  }
  if (!store.hasRuntimeCandidates(sessionId)) {
    const error = createPlaybackRuntimeError(
      "SOURCE_UNAVAILABLE",
      getActionMessage(action, {
        play: "Playback needs to be prepared again.",
        download: "Download needs to be prepared again.",
        cast: "Casting needs to be prepared again.",
      }),
      { retryable: true, shouldFallback: false },
    );
    store.failSession(sessionId, error);
    return { ok: false, sessionId, error };
  }

  const candidates = [...session.candidates].sort((a, b) => a.rank - b.rank);
  const startIndex = startCandidateId
    ? candidates.findIndex((candidate) => candidate.id === startCandidateId)
    : Math.max(
        0,
        candidates.findIndex(
          (candidate) => candidate.id === session.selectedCandidateId,
        ),
      );
  const orderedCandidates = startIndex >= 0 ? candidates.slice(startIndex) : [];
  let fallbackReason = initialFallbackReason;

  for (const [index, candidate] of orderedCandidates.entries()) {
    selectCandidate(sessionId, candidate.id, fallbackReason);
    const hasFallback = index < orderedCandidates.length - 1;
    const result = await attemptCandidate(
      sessionId,
      candidate.id,
      hasFallback,
      action,
    );
    if (result.ok) {
      return {
        ...result,
        fallbackReason:
          candidate.id === session.selectedCandidateId
            ? undefined
            : fallbackReason,
      };
    }

    fallbackReason = result.error.message;
    if (isTerminal(getSession(sessionId))) return result;
  }

  const error =
    getSession(sessionId)?.attempts.at(-1)?.error ||
    createPlaybackRuntimeError("SOURCE_UNAVAILABLE", undefined, {
      retryable: true,
      shouldFallback: false,
    });
  const terminalError = { ...error, shouldFallback: false };
  if (!isTerminal(getSession(sessionId))) {
    store.failSession(sessionId, terminalError);
  }
  return { ok: false, sessionId, error: terminalError };
}

export function resolvePlaybackSession(
  sessionId: string,
  startCandidateId?: string,
): Promise<PlaybackSessionResolutionResult> {
  const existing = resolutionBySession.get(sessionId);
  if (existing) return existing;

  const resolution = resolveCandidateChain(
    sessionId,
    "play",
    startCandidateId,
  ).finally(() => {
    resolutionBySession.delete(sessionId);
  });
  resolutionBySession.set(sessionId, resolution);
  return resolution;
}

export async function resolveDownloadSession(
  sessionId: string,
  startCandidateId?: string,
): Promise<PlaybackSessionDownloadResolutionResult> {
  const existing = resolutionBySession.get(sessionId);
  const resolution =
    existing ||
    resolveCandidateChain(sessionId, "download", startCandidateId).finally(
      () => {
        resolutionBySession.delete(sessionId);
      },
    );
  if (!existing) resolutionBySession.set(sessionId, resolution);

  const result = await resolution;
  if (!result.ok) return result;
  if (result.eligibility) {
    return {
      ...result,
      eligibility: result.eligibility,
    };
  }

  const error = createPlaybackRuntimeError(
    "SOURCE_UNAVAILABLE",
    "Download eligibility could not be verified.",
    { retryable: true, shouldFallback: false },
  );
  if (!isTerminal(getSession(sessionId))) {
    usePlaybackSessionStore.getState().failSession(sessionId, error);
  }
  return { ok: false, sessionId, error };
}

export function resolveCastSession(
  sessionId: string,
  startCandidateId?: string,
): Promise<PlaybackSessionResolutionResult> {
  const existing = resolutionBySession.get(sessionId);
  if (existing) return existing;

  const resolution = resolveCandidateChain(
    sessionId,
    "cast",
    startCandidateId,
  ).finally(() => {
    resolutionBySession.delete(sessionId);
  });
  resolutionBySession.set(sessionId, resolution);
  return resolution;
}

async function advanceSessionAfterFailure(
  sessionId: string,
  candidateId: string,
  attemptId: string | null,
  error: PlaybackRuntimeError,
  action: "play" | "cast",
): Promise<PlaybackSessionResolutionResult> {
  const store = usePlaybackSessionStore.getState();
  const session = getSession(sessionId);
  if (!session) return { ok: false, sessionId, error };
  if (session.action !== action) {
    const actionError = createPlaybackRuntimeError(
      "SOURCE_UNAVAILABLE",
      `This session cannot be used for ${action}.`,
      { retryable: false, shouldFallback: false },
    );
    if (!isTerminal(session)) store.failSession(sessionId, actionError);
    return { ok: false, sessionId, error: actionError };
  }
  if (isTerminal(session)) {
    return { ok: false, sessionId, error: runtimeErrorFromSession(session) };
  }

  stopActiveEngine(sessionId);
  const attempt =
    session.attempts.find((item) => item.id === attemptId) ||
    [...session.attempts]
      .reverse()
      .find((item) => item.candidateId === candidateId);
  const candidates = [...session.candidates].sort((a, b) => a.rank - b.rank);
  const candidateIndex = candidates.findIndex(
    (candidate) => candidate.id === candidateId,
  );
  const nextCandidate = candidates[candidateIndex + 1];
  const safeError = createPlaybackRuntimeError(error.code, undefined, {
    retryable: error.retryable,
    shouldFallback: !!nextCandidate,
    debugMessage: error.debugMessage || error.message,
  });

  if (attempt && attempt.status !== "failed") {
    store.dispatchPlaybackEvent(sessionId, {
      type: "attempt_failed",
      attemptId: attempt.id,
      candidateId,
      error: toPlaybackSessionError(safeError),
    });
  }

  if (!nextCandidate) {
    store.failSession(sessionId, { ...safeError, shouldFallback: false });
    return {
      ok: false,
      sessionId,
      error: { ...safeError, shouldFallback: false },
    };
  }

  return resolveCandidateChain(
    sessionId,
    action,
    nextCandidate.id,
    safeError.message,
  );
}

export function advancePlaybackSessionAfterFailure(
  sessionId: string,
  candidateId: string,
  attemptId: string | null,
  error: PlaybackRuntimeError,
): Promise<PlaybackSessionResolutionResult> {
  return advanceSessionAfterFailure(
    sessionId,
    candidateId,
    attemptId,
    error,
    "play",
  );
}

export function advanceCastSessionAfterFailure(
  sessionId: string,
  candidateId: string,
  attemptId: string | null,
  error: PlaybackRuntimeError,
): Promise<PlaybackSessionResolutionResult> {
  return advanceSessionAfterFailure(
    sessionId,
    candidateId,
    attemptId,
    error,
    "cast",
  );
}

export function markPlaybackSessionBuffering(sessionId: string) {
  dispatchSessionStatus(sessionId, "buffering");
}

export function markPlaybackSessionPlaying(sessionId: string) {
  dispatchSessionStatus(sessionId, "playing");
}

export function markPlaybackSessionCasting(sessionId: string) {
  dispatchSessionStatus(sessionId, "casting");
}

export function failPlaybackSession(
  sessionId: string,
  error: PlaybackRuntimeError,
) {
  stopActiveEngine(sessionId);
  clearSessionBreadcrumbState(sessionId);
  const session = getSession(sessionId);
  if (session && !isTerminal(session)) {
    usePlaybackSessionStore.getState().failSession(sessionId, error);
  }
}

export function completePlaybackSession(sessionId: string) {
  stopActiveEngine(sessionId);
  clearSessionBreadcrumbState(sessionId);
  const session = getSession(sessionId);
  if (session && !isTerminal(session)) {
    usePlaybackSessionStore.getState().completeSession(sessionId);
  }
}

export function cancelPlaybackSession(sessionId: string, reason?: string) {
  stopActiveEngine(sessionId);
  clearSessionBreadcrumbState(sessionId);
  const session = getSession(sessionId);
  if (session && !isTerminal(session)) {
    usePlaybackSessionStore.getState().cancelSession(sessionId, reason);
  }
}
