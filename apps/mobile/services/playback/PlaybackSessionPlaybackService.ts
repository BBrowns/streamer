import type {
  PlaybackGatewayPhase,
  PlaybackRuntimeError,
  PlaybackRoute,
  PlaybackSession,
  PlaybackSessionStatus,
  PlaybackPlanCandidate,
  PlannedMediaCandidate,
  PlannedMediaCandidateV3,
  Stream,
} from "@streamer/shared";
import { usePlaybackSessionStore } from "../../stores/playbackSessionStore";
import {
  getDownloadEligibility,
  type DownloadEligibility,
} from "../downloadEligibility";
import {
  isStreamEngineCancellationError,
  type GatewayJobProgress,
  type IStreamEngine,
} from "../streamEngine/IStreamEngine";
import { streamEngineManager } from "../streamEngine/StreamEngineManager";
import {
  BridgeV1SourceAdapter,
  DirectSourceAdapter,
  HlsSourceAdapter,
  LegacyStreamEngineAdapter,
  SourcePreparationError,
  SourcePreparationRegistry,
  SourcePreparer,
  isSourcePreparationError,
  type PreparedSource,
  type SourcePreparationAdapter,
} from "../sourcePreparation";
import { getUnsupportedWebCodecReason } from "../streamEngine/codecSupport";
import {
  createPlaybackRuntimeError,
  inferPlaybackErrorCodeFromMessages,
  runtimeErrorFromActionPreflight,
} from "./PlaybackErrors";
import { toPlaybackSessionError } from "./PlaybackSessionReducer";
import { addMobileBreadcrumb } from "../sentryBreadcrumbs";
import {
  ActionPreflightError,
  buildActionBridgeHint,
  preflightStreamAction,
  requireActionPreflight,
} from "../actionPreflight";
import { getDeviceProfile } from "./deviceProfile";

const TERMINAL_STATUSES = new Set<PlaybackSessionStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const activeSourceBySession = new Map<string, PreparedSource>();
const activeReleaseBySession = new Map<string, Promise<void>>();
const preparationAbortBySession = new Map<string, AbortController>();
const resolutionBySession = new Map<
  string,
  Promise<PlaybackSessionInternalResolutionResult>
>();
const lastGatewayBreadcrumbPhaseBySession = new Map<string, string>();

/**
 * Runtime-only handoff for the active player. Deliberately excludes the
 * resolved URI and source payload so neither can leak into UI state or
 * persistence while the screen adopts the prepared runtime.
 */
export interface ActivePlaybackSourceRuntime {
  route?: PlaybackRoute;
  bridgeJobId?: string;
  runtime?: IStreamEngine;
}

export function getActivePlaybackSourceRuntime(
  sessionId: string,
  attemptId: string,
): ActivePlaybackSourceRuntime | null {
  const source = activeSourceBySession.get(sessionId);
  const session = getSession(sessionId);
  const attempt = session?.attempts.find((item) => item.id === attemptId);
  if (
    !source ||
    source.released ||
    source.attemptId !== attemptId ||
    !session ||
    isTerminal(session) ||
    !attempt ||
    attempt.status !== "ready" ||
    session.selectedCandidateId !== attempt.candidateId
  ) {
    return null;
  }

  return {
    ...(source.route
      ? {
          route: {
            ...source.route,
            capabilities: { ...source.route.capabilities },
          },
        }
      : {}),
    ...(source.bridgeJobId ? { bridgeJobId: source.bridgeJobId } : {}),
    ...(source.runtime ? { runtime: source.runtime } : {}),
  };
}

export interface PlaybackSessionResolutionSuccess {
  ok: true;
  sessionId: string;
  candidateId: string;
  attemptId: string;
  stream: Stream;
  uri: string;
  route?: PlaybackRoute;
  bridgeJobId?: string;
  runtime?: IStreamEngine;
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

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function isRoutedCandidate(
  candidate: PlaybackPlanCandidate,
): candidate is PlannedMediaCandidateV3 {
  return "route" in candidate;
}

function sameRoute(
  left: PlaybackRoute | undefined,
  right: PlaybackRoute | undefined,
) {
  if (!left || !right) return left === right;

  return (
    left.candidateId === right.candidateId &&
    left.executionTarget === right.executionTarget &&
    left.delivery === right.delivery &&
    left.capabilities.seek === right.capabilities.seek &&
    left.capabilities.audioTracks === right.capabilities.audioTracks &&
    left.capabilities.embeddedSubtitles ===
      right.capabilities.embeddedSubtitles &&
    left.capabilities.externalSubtitles ===
      right.capabilities.externalSubtitles &&
    left.capabilities.cast === right.capabilities.cast &&
    left.capabilities.offline === right.capabilities.offline &&
    left.capabilities.thumbnails === right.capabilities.thumbnails
  );
}

function buildRuntimeSourcePreparer(
  candidate: PlaybackPlanCandidate,
  session: PlaybackSession,
) {
  const adapters: SourcePreparationAdapter[] = [
    new DirectSourceAdapter(),
    new HlsSourceAdapter(),
  ];

  if (
    isRoutedCandidate(candidate) &&
    (candidate.route.executionTarget === "local-sidecar" ||
      candidate.route.executionTarget === "paired-bridge")
  ) {
    const bridgeUrl = buildActionBridgeHint({
      deviceProfile: session.deviceProfile,
    }).url;
    if (!bridgeUrl) {
      throw new SourcePreparationError(
        "BRIDGE_UNAVAILABLE",
        "The selected bridge route has no trusted runtime endpoint.",
        { retryable: true, shouldFallback: false },
      );
    }
    adapters.push(
      new BridgeV1SourceAdapter({
        executionTarget: candidate.route.executionTarget,
        baseUrl: bridgeUrl,
      }),
    );
  }

  return new SourcePreparer(
    new SourcePreparationRegistry(adapters),
    new LegacyStreamEngineAdapter(streamEngineManager),
  );
}

function candidateWithPreparationStream(
  candidate: PlaybackPlanCandidate,
  stream: Stream,
): PlaybackPlanCandidate {
  if (isRoutedCandidate(candidate)) return candidate;
  return {
    ...(candidate as PlannedMediaCandidate),
    stream,
  };
}

function toSafeRuntimeError(
  error: unknown,
  candidate: PlaybackPlanCandidate | null,
  shouldFallback: boolean,
): PlaybackRuntimeError {
  if (error instanceof ActionPreflightError) {
    return runtimeErrorFromActionPreflight(error.preflight, shouldFallback);
  }

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

  if (isSourcePreparationError(error)) {
    const causeMessage = getErrorMessage(error.cause);
    const inferredCode = causeMessage
      ? inferPlaybackErrorCodeFromMessages([causeMessage])
      : undefined;
    const code =
      inferredCode ||
      (error.code === "UNSUPPORTED_ROUTE"
        ? candidate?.requiresBridge
          ? "BRIDGE_UNSUPPORTED"
          : "SOURCE_UNAVAILABLE"
        : error.code === "INVALID_SOURCE" || error.code === "CANCELLED"
          ? "SOURCE_UNAVAILABLE"
          : error.code);
    return createPlaybackRuntimeError(code, undefined, {
      retryable: error.retryable,
      shouldFallback: shouldFallback && error.shouldFallback,
      debugMessage: causeMessage || error.message,
    });
  }

  const rawMessage = getErrorMessage(error);
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
  candidate: PlaybackPlanCandidate,
): Stream {
  const plan = usePlaybackSessionStore.getState().getRuntimePlan(sessionId);
  const playbackUrl =
    plan?.version === 2 && plan.plan?.selectedCandidate.id === candidate.id
      ? plan.plan?.playbackUrl
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
  candidate: PlaybackPlanCandidate,
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
    // A provider label can omit its real container. Reserve the remux window
    // for an unknown torrent too: after metadata the bridge may correctly
    // discover an MKV and upgrade the gateway job. Without this allowance the
    // outer client timeout could cancel a still-progressing remux a few
    // seconds before the bridge's authoritative readiness deadline.
    const mayRequireRemux =
      candidate.requiresRemux || candidate.container === "unknown";
    candidateBudgetMs =
      timeoutBudget.bridgeConnectMs +
      timeoutBudget.torrentMetadataMs +
      timeoutBudget.peerDiscoveryMs +
      (mayRequireRemux ? timeoutBudget.remuxReadyMs : 0);
  }

  return Math.min(candidateBudgetMs, remainingMs);
}

function createAllCandidatesFailedError(
  session: PlaybackSession | null,
  action: SessionResolutionAction,
): PlaybackRuntimeError {
  const failedAttempts =
    session?.attempts.filter((attempt) => attempt.status === "failed") ?? [];
  const lastAttemptError = failedAttempts.at(-1)?.error;

  if (failedAttempts.length <= 1 && lastAttemptError) {
    return { ...lastAttemptError, shouldFallback: false };
  }

  const debugMessage =
    failedAttempts
      .map((attempt) => `${attempt.sourceType}:${attempt.error?.code}`)
      .join("; ") || undefined;

  return createPlaybackRuntimeError(
    "NO_PLAYABLE_SOURCE",
    getActionMessage(action, {
      play: "No playable source worked for this title.",
      download: "No downloadable source worked for this title.",
      cast: "No castable source worked for this title.",
    }),
    {
      retryable: true,
      shouldFallback: false,
      debugMessage,
    },
  );
}

function createSessionBudgetExhaustedError(
  session: PlaybackSession,
  action: SessionResolutionAction,
): PlaybackRuntimeError {
  const hadBridgeAttempt = session.attempts.some(
    (attempt) => attempt.sourceType === "torrent",
  );
  const code = hadBridgeAttempt ? "GATEWAY_TIMEOUT" : "PLAYBACK_TIMEOUT";

  return createPlaybackRuntimeError(
    code,
    getActionMessage(action, {
      play: "Sources were found, but none became ready in time. Try another source or retry.",
      download:
        "Sources were found, but none became ready in time for download. Try another source or retry.",
      cast: "Sources were found, but none became ready in time for casting. Try another source or retry.",
    }),
    {
      retryable: true,
      shouldFallback: false,
      debugMessage: "playback-session-time-budget-exhausted",
    },
  );
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (callback: () => void) => {
      if (settled) return;

      settled = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      callback();
    };

    const handleTimeout = () => {
      finish(() => {
        // Mark the wrapper as settled before aborting the engine.
        // The cancellation rejection from the engine is therefore consumed
        // as a late result instead of replacing the timeout.
        try {
          onTimeout?.();
        } catch (cleanupError) {
          console.warn(
            "[PlaybackSession] Failed to stop timed-out engine:",
            cleanupError,
          );
        }

        reject(new PlaybackResolutionTimeoutError(message));
      });
    };

    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );

    if (timeoutMs <= 0) {
      handleTimeout();
      return;
    }

    timer = setTimeout(handleTimeout, timeoutMs);
  });
}

function abortActivePreparation(sessionId: string, reason?: string) {
  const controller = preparationAbortBySession.get(sessionId);
  preparationAbortBySession.delete(sessionId);
  if (controller && !controller.signal.aborted) controller.abort(reason);
}

async function releaseActiveSource(sessionId: string): Promise<void> {
  const existingRelease = activeReleaseBySession.get(sessionId);
  if (existingRelease) {
    await existingRelease;
    return;
  }

  const source = activeSourceBySession.get(sessionId);
  activeSourceBySession.delete(sessionId);
  if (!source) return;

  const release = source
    .release()
    .catch(() => {
      console.warn("[PlaybackSession] Failed to release prepared source.");
    })
    .finally(() => {
      if (activeReleaseBySession.get(sessionId) === release) {
        activeReleaseBySession.delete(sessionId);
      }
    });
  activeReleaseBySession.set(sessionId, release);
  await release;
}

async function stopActiveSource(sessionId: string, reason?: string) {
  abortActivePreparation(sessionId, reason);
  await releaseActiveSource(sessionId);
}

async function releasePreparedSource(source: PreparedSource) {
  try {
    await source.release();
  } catch {
    console.warn("[PlaybackSession] Failed to release prepared source.");
  }
}

function isPreparationLifecycleCurrent(
  sessionId: string,
  candidateId: string,
  candidate: PlaybackPlanCandidate,
  attemptId: string,
  preparationController: AbortController,
) {
  const currentSession = getSession(sessionId);
  const currentCandidate = usePlaybackSessionStore
    .getState()
    .getRuntimeCandidate(sessionId, candidateId);
  const currentAttempt = currentSession?.attempts.find(
    (item) => item.id === attemptId,
  );

  return (
    preparationAbortBySession.get(sessionId) === preparationController &&
    !preparationController.signal.aborted &&
    !!currentSession &&
    !isTerminal(currentSession) &&
    currentSession.selectedCandidateId === candidateId &&
    currentCandidate === candidate &&
    currentAttempt?.candidateId === candidateId &&
    currentAttempt.status === "attempting"
  );
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

  // Primary viewing can consume a fragmented MP4 as the torrent arrives. Keep
  // the completed seekable MP4 path for download and cast, which need stable
  // byte ranges rather than the fastest possible first frame. Planner v3
  // already carries this decision in its exact delivery route, so only the
  // isolated v2 compatibility adapter still needs the legacy hint.
  const streamForResolution: Stream =
    !isRoutedCandidate(candidate) && action === "play" && stream.infoHash
      ? {
          ...stream,
          behaviorHints: {
            ...stream.behaviorHints,
            remuxStrategy: "progressive-fmp4",
          },
        }
      : stream;

  await stopActiveSource(sessionId, "Preparing the selected source.");
  const sessionAfterRelease = getSession(sessionId);
  if (!sessionAfterRelease || isTerminal(sessionAfterRelease)) {
    return {
      ok: false,
      sessionId,
      error: sessionAfterRelease
        ? runtimeErrorFromSession(sessionAfterRelease)
        : createPlaybackRuntimeError("SOURCE_UNAVAILABLE"),
    };
  }

  if (candidate.requiresBridge || candidate.kind === "torrent") {
    dispatchSessionStatus(sessionId, "checking_bridge");
  } else {
    dispatchSessionStatus(sessionId, "probing_playback_url");
  }

  const onGateway = (progress: GatewayJobProgress) =>
    recordGatewayEvent(sessionId, candidateId, progress);
  const preparationController = new AbortController();
  preparationAbortBySession.set(sessionId, preparationController);

  try {
    const actionDeviceProfile =
      action === "cast" ? getDeviceProfile() : session.deviceProfile;
    requireActionPreflight(
      preflightStreamAction(action, stream, {
        deviceProfile: actionDeviceProfile,
        requiresRemux: candidate.requiresRemux,
      }),
    );
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
    const sourcePreparer = buildRuntimeSourcePreparer(
      candidate,
      currentSession,
    );
    const preparationCandidate = candidateWithPreparationStream(
      candidate,
      streamForResolution,
    );
    const preparation = isRoutedCandidate(preparationCandidate)
      ? sourcePreparer.prepare({
          action,
          attemptId: attempt.id,
          requestId: attempt.id,
          candidate: preparationCandidate,
          route: preparationCandidate.route,
          signal: preparationController.signal,
          onGatewayProgress: onGateway,
        })
      : sourcePreparer.prepare({
          action,
          attemptId: attempt.id,
          requestId: attempt.id,
          candidate: preparationCandidate,
          signal: preparationController.signal,
          onGatewayProgress: onGateway,
        });
    const preparedSource = await withTimeout(
      preparation,
      timeoutMs,
      getActionMessage(action, {
        play: "Playback source preparation timed out.",
        download: "Download source preparation timed out.",
        cast: "Cast source preparation timed out.",
      }),
      () => {
        if (
          preparationAbortBySession.get(sessionId) === preparationController
        ) {
          preparationController.abort("Source preparation timed out.");
        }
      },
    );

    if (
      !isPreparationLifecycleCurrent(
        sessionId,
        candidateId,
        candidate,
        attempt.id,
        preparationController,
      )
    ) {
      await releasePreparedSource(preparedSource);
      const supersededSession = getSession(sessionId);
      return {
        ok: false,
        sessionId,
        error: supersededSession
          ? runtimeErrorFromSession(supersededSession)
          : createPlaybackRuntimeError("SOURCE_UNAVAILABLE"),
      };
    }

    const expectedRoute = isRoutedCandidate(candidate)
      ? candidate.route
      : undefined;
    if (
      preparedSource.released ||
      preparedSource.attemptId !== attempt.id ||
      !sameRoute(preparedSource.route, expectedRoute)
    ) {
      await releasePreparedSource(preparedSource);
      throw new SourcePreparationError(
        "INVALID_SOURCE",
        "The prepared source does not match the active playback attempt and route.",
        { retryable: false, shouldFallback: false },
      );
    }

    const latestSession = getSession(sessionId);
    if (!latestSession || isTerminal(latestSession)) {
      await releasePreparedSource(preparedSource);
      return {
        ok: false,
        sessionId,
        error: latestSession
          ? runtimeErrorFromSession(latestSession)
          : createPlaybackRuntimeError("SOURCE_UNAVAILABLE"),
      };
    }

    const { uri } = preparedSource;
    if (!uri || uri.length === 0) {
      await releasePreparedSource(preparedSource);
      if (candidate.requiresBridge || candidate.kind === "torrent") {
        requireActionPreflight(
          preflightStreamAction(action, stream, {
            deviceProfile: actionDeviceProfile,
            requiresRemux: candidate.requiresRemux,
          }),
        );
        if (streamEngineManager.bridgeStatus === "no-peers") {
          throw new Error("No peers found.");
        }
      }
      throw new Error("Source did not return a playback URL.");
    }

    activeSourceBySession.set(sessionId, preparedSource);
    const resolvedStream = preparedSource.stream;
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
      route: preparedSource.route,
      bridgeJobId: preparedSource.bridgeJobId,
      runtime: preparedSource.runtime,
      eligibility,
    };
  } catch (error) {
    if (
      isStreamEngineCancellationError(error) ||
      (isSourcePreparationError(error) && error.isCancellation)
    ) {
      let cancelledSession = getSession(sessionId);
      if (cancelledSession && !isTerminal(cancelledSession)) {
        store.cancelSession(
          sessionId,
          getActionMessage(action, {
            play: "Playback preparation was cancelled.",
            download: "Download preparation was cancelled.",
            cast: "Cast preparation was cancelled.",
          }),
        );
        cancelledSession = getSession(sessionId);
      }

      await stopActiveSource(sessionId, "Source preparation was cancelled.");
      clearSessionBreadcrumbState(sessionId);
      return {
        ok: false,
        sessionId,
        error: cancelledSession
          ? runtimeErrorFromSession(cancelledSession)
          : createPlaybackRuntimeError("SOURCE_UNAVAILABLE", undefined, {
              retryable: false,
              shouldFallback: false,
            }),
      };
    }

    const latestSession = getSession(sessionId);
    if (!latestSession || isTerminal(latestSession)) {
      await stopActiveSource(sessionId, "Playback session ended.");
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
    await stopActiveSource(sessionId, "Source preparation failed.");
    return { ok: false, sessionId, error: runtimeError };
  } finally {
    if (preparationAbortBySession.get(sessionId) === preparationController) {
      preparationAbortBySession.delete(sessionId);
    }
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

    // Do not turn every remaining candidate into an immediate zero-ms failure
    // once the session-wide envelope has elapsed. The previous behaviour
    // resulted in a misleading "No playable source" terminal state despite
    // having discovered sources and possibly still receiving peers/remux data.
    if (getRemainingBudgetMs(currentSession) <= 0) {
      const error = createSessionBudgetExhaustedError(currentSession, action);
      store.failSession(sessionId, error);
      return { ok: false, sessionId, error };
    }

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

  const terminalError = createAllCandidatesFailedError(
    getSession(sessionId),
    action,
  );
  if (!isTerminal(getSession(sessionId))) {
    store.failSession(sessionId, terminalError);
  }
  return { ok: false, sessionId, error: terminalError };
}

function runSessionResolutionSingleFlight(
  sessionId: string,
  resolve: () => Promise<PlaybackSessionInternalResolutionResult>,
) {
  const existing = resolutionBySession.get(sessionId);
  if (existing) return existing;

  const resolution = resolve().finally(() => {
    if (resolutionBySession.get(sessionId) === resolution) {
      resolutionBySession.delete(sessionId);
    }
  });
  resolutionBySession.set(sessionId, resolution);
  return resolution;
}

export function resolvePlaybackSession(
  sessionId: string,
  startCandidateId?: string,
): Promise<PlaybackSessionResolutionResult> {
  return runSessionResolutionSingleFlight(sessionId, () =>
    resolveCandidateChain(sessionId, "play", startCandidateId),
  );
}

export async function resolveDownloadSession(
  sessionId: string,
  startCandidateId?: string,
): Promise<PlaybackSessionDownloadResolutionResult> {
  const resolution = runSessionResolutionSingleFlight(sessionId, () =>
    resolveCandidateChain(sessionId, "download", startCandidateId),
  );

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
  return runSessionResolutionSingleFlight(sessionId, () =>
    resolveCandidateChain(sessionId, "cast", startCandidateId),
  );
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

  await stopActiveSource(sessionId, "Switching to a fallback source.");
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
  return runSessionResolutionSingleFlight(sessionId, () =>
    advanceSessionAfterFailure(
      sessionId,
      candidateId,
      attemptId,
      error,
      "play",
    ),
  );
}

export function advanceCastSessionAfterFailure(
  sessionId: string,
  candidateId: string,
  attemptId: string | null,
  error: PlaybackRuntimeError,
): Promise<PlaybackSessionResolutionResult> {
  return runSessionResolutionSingleFlight(sessionId, () =>
    advanceSessionAfterFailure(
      sessionId,
      candidateId,
      attemptId,
      error,
      "cast",
    ),
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
  void stopActiveSource(sessionId, "Playback session failed.");
  clearSessionBreadcrumbState(sessionId);
  const session = getSession(sessionId);
  if (session && !isTerminal(session)) {
    usePlaybackSessionStore.getState().failSession(sessionId, error);
  }
}

export function completePlaybackSession(sessionId: string) {
  void stopActiveSource(sessionId, "Playback session completed.");
  clearSessionBreadcrumbState(sessionId);
  const session = getSession(sessionId);
  if (session && !isTerminal(session)) {
    usePlaybackSessionStore.getState().completeSession(sessionId);
  }
}

export function cancelPlaybackSession(sessionId: string, reason?: string) {
  const session = getSession(sessionId);

  if (session && !isTerminal(session)) {
    usePlaybackSessionStore.getState().cancelSession(sessionId, reason);
  }

  void stopActiveSource(sessionId, reason || "Playback session cancelled.");
  clearSessionBreadcrumbState(sessionId);
}
