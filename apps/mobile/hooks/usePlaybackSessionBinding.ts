import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type {
  PlaybackRuntimeError,
  PlaybackRuntimeState,
  Stream,
} from "@streamer/shared";

import { usePlayerStore } from "../stores/playerStore";
import type {
  MediaInfo,
  PlaybackLaunchIntent,
  StreamLoadState,
} from "../stores/playerStore";
import { usePlaybackSessionStore } from "../stores/playbackSessionStore";
import {
  cancelPlaybackLaunch,
  getPlaybackLaunch,
  isPlaybackLaunchCancelled,
  releasePlaybackLaunch,
} from "../services/playback/PlaybackLaunchService";
import {
  cancelPlaybackSession,
  advancePlaybackSessionAfterFailure,
  resolvePlaybackSession,
} from "../services/playback/PlaybackSessionPlaybackService";
import { playBest } from "../services/playback/PlaybackOrchestrator";
import { createPlaybackRuntimeError } from "../services/playback/PlaybackErrors";
import { hasNewStablePlaybackCandidate } from "../services/playback/partialDiscovery";
import {
  captureFallbackContinuity,
  type FallbackContinuitySnapshot,
} from "../services/playback/FallbackContinuity";
import type { PlaybackDiagnosticEvent } from "../services/playback/PlaybackDiagnostics";
import type { PlaybackRuntimeViewEvent } from "../services/playback/PlaybackRuntimeCoordinator";

type SetSessionStream = (
  stream: Stream,
  media: MediaInfo | undefined,
  sessionId: string,
  candidateId: string,
  attemptId?: string | null,
  fallbackReason?: string | null,
  launchIntent?: PlaybackLaunchIntent | null,
) => void;

export interface UsePlaybackSessionBindingOptions {
  mediaInfo: MediaInfo | null;
  planningLaunchId: string | null;
  playbackSessionId: string | null;
  playbackCandidateId: string | null;
  playbackAttemptId: string | null;
  playbackUri: string | null;
  setPlaybackUri: (uri: string | null) => void;
  setStreamStatus: (
    state: StreamLoadState,
    errorMessage?: string | null,
  ) => void;
  setRuntimeState: (
    runtimeState: PlaybackRuntimeState,
    runtimeError?: PlaybackRuntimeError | null,
  ) => void;
  setSessionStream: SetSessionStream;
  advanceToNextFallback: (reason?: string | null) => Stream | null;
  recordDiagnostic: (event: PlaybackDiagnosticEvent) => void;
  dispatchRuntimeViewEvent: (event: PlaybackRuntimeViewEvent) => void;
  setFallbackStatusMessage: (message: string | null) => void;
  setBuffering: (buffering: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setRuntimeFailure: (error: PlaybackRuntimeError) => void;
  getFallbackStatusMessage: () => string;
  abortSeekableHandoff: () => void;
  requestLegacyFallback: () => void;
  setPlaybackPlanningFailure: (
    launchId: string,
    error: PlaybackRuntimeError,
    sessionId?: string,
  ) => void;
}

export interface PlaybackSessionBinding {
  /** The provisional session currently owned by a planning launch or replan. */
  launchOwnedSessionIdRef: MutableRefObject<string | null>;
  /** The active partial-discovery request, when recovery is in progress. */
  partialReplanControllerRef: MutableRefObject<AbortController | null>;
  /** True while a serial fallback/session advance owns the current attempt. */
  fallbackInFlightRef: MutableRefObject<boolean>;
  /** Continuity captured before the next source becomes ready. */
  pendingFallbackRestoreRef: MutableRefObject<FallbackContinuitySnapshot | null>;
  /** Allows retry to reuse the same ownership contract after a fresh Play Best. */
  tryReplanPartialPlayback: (sessionId: string) => Promise<boolean>;
  /** Cancels pending planning/replan work and the owned session. */
  cancelOwnedPlayback: (
    reason: string,
    options?: { removeSession?: boolean },
  ) => void;
  /** Returns the current session known to the binding, if any. */
  getOwnedSessionId: () => string | null;
  tryAdvanceToFallback: (
    error: ReturnType<typeof createPlaybackRuntimeError>,
    reason?: string | null,
  ) => Promise<boolean>;
}

function discardSession(sessionId: string | undefined, reason: string) {
  if (!sessionId) return;
  cancelPlaybackSession(sessionId, reason);
  usePlaybackSessionStore.getState().removeSession(sessionId);
}

/**
 * Binds the player route to the session control plane.
 *
 * Planning launches, partial-discovery recovery, and route-exit cleanup all
 * share the same ownership refs here. The hook deliberately does not create
 * playback state: PlaybackSessionPlaybackService and the Zustand session store
 * remain the only lifecycle authorities.
 */
export function usePlaybackSessionBinding({
  mediaInfo,
  planningLaunchId,
  playbackSessionId,
  playbackCandidateId,
  playbackAttemptId,
  playbackUri,
  setPlaybackUri,
  setStreamStatus,
  setRuntimeState,
  setSessionStream,
  advanceToNextFallback,
  setPlaybackPlanningFailure,
  recordDiagnostic,
  dispatchRuntimeViewEvent,
  setFallbackStatusMessage,
  setBuffering,
  setPlaying,
  setRuntimeFailure,
  getFallbackStatusMessage,
  abortSeekableHandoff,
  requestLegacyFallback,
}: UsePlaybackSessionBindingOptions): PlaybackSessionBinding {
  const launchOwnedSessionIdRef = useRef<string | null>(null);
  const activePlanningLaunchIdRef = useRef<string | null>(planningLaunchId);
  const activePlaybackSessionIdRef = useRef<string | null>(playbackSessionId);
  const partialReplanAttemptsRef = useRef(new Set<string>());
  const partialReplanPromisesRef = useRef(new Map<string, Promise<boolean>>());
  const partialReplanControllerRef = useRef<AbortController | null>(null);
  const fallbackInFlightRef = useRef(false);
  const fallbackAttemptRef = useRef(0);
  const pendingFallbackRestoreRef = useRef<FallbackContinuitySnapshot | null>(
    null,
  );

  useEffect(() => {
    activePlanningLaunchIdRef.current = planningLaunchId;
  }, [planningLaunchId]);

  useEffect(() => {
    activePlaybackSessionIdRef.current = playbackSessionId;
  }, [playbackSessionId]);

  const abortPartialReplan = useCallback(() => {
    partialReplanControllerRef.current?.abort();
    partialReplanControllerRef.current = null;
  }, []);

  const getOwnedSessionId = useCallback(
    () => launchOwnedSessionIdRef.current || activePlaybackSessionIdRef.current,
    [],
  );

  const cancelOwnedPlayback = useCallback(
    (reason: string, options: { removeSession?: boolean } = {}) => {
      abortPartialReplan();

      const launchId = activePlanningLaunchIdRef.current;
      if (launchId) cancelPlaybackLaunch(launchId, reason);

      const sessionId = getOwnedSessionId();
      if (!sessionId) return;

      cancelPlaybackSession(sessionId, reason);
      const shouldRemove =
        options.removeSession ??
        Boolean(launchId || launchOwnedSessionIdRef.current === sessionId);
      if (shouldRemove) {
        usePlaybackSessionStore.getState().removeSession(sessionId);
      }
      if (launchOwnedSessionIdRef.current === sessionId) {
        launchOwnedSessionIdRef.current = null;
      }
    },
    [abortPartialReplan, getOwnedSessionId],
  );

  const tryReplanPartialPlayback = useCallback(
    async (sessionId: string) => {
      if (!mediaInfo) return false;

      const replanKey = [
        mediaInfo.type,
        mediaInfo.itemId,
        mediaInfo.season ?? "",
        mediaInfo.episode ?? "",
      ].join(":");
      const existingReplan = partialReplanPromisesRef.current.get(replanKey);
      if (existingReplan) return existingReplan;
      if (partialReplanAttemptsRef.current.has(replanKey)) return false;

      const previousPlan = usePlaybackSessionStore
        .getState()
        .getRuntimePlan(sessionId);
      if (previousPlan?.sourceDiscovery?.status !== "partial") return false;

      const replan = (async () => {
        partialReplanAttemptsRef.current.add(replanKey);
        // Remove a terminal session before waiting for the warmed discovery
        // cache so this recovery remains visibly cancellable.
        usePlaybackSessionStore.getState().removeSession(sessionId);
        if (launchOwnedSessionIdRef.current === sessionId) {
          launchOwnedSessionIdRef.current = null;
        }
        const controller = new AbortController();
        partialReplanControllerRef.current = controller;
        setPlaybackUri(null);
        setStreamStatus("loading_metrics");
        setRuntimeState("planning");
        let replacement;
        try {
          replacement = await playBest(
            {
              type: mediaInfo.type,
              id: mediaInfo.itemId,
              title: mediaInfo.title,
              poster: mediaInfo.poster,
              background: mediaInfo.background,
              season: mediaInfo.season,
              episode: mediaInfo.episode,
            },
            {
              forceRefresh: true,
              awaitCompleteDiscovery: true,
              signal: controller.signal,
            },
          );
        } catch {
          // Escape/Close owns this controller; a late rejection is handled.
          return controller.signal.aborted;
        } finally {
          if (partialReplanControllerRef.current === controller) {
            partialReplanControllerRef.current = null;
          }
        }

        if (controller.signal.aborted) {
          discardSession(
            replacement.sessionId,
            "Partial discovery recovery was cancelled.",
          );
          return true;
        }

        const replacementCandidates = replacement.plan?.orderedCandidates ?? [];
        const hasNewCandidate = hasNewStablePlaybackCandidate(
          previousPlan.orderedCandidates,
          replacementCandidates,
        );

        // Do not restart an identical partial plan just because the planner
        // minted a new UUID for the same source.
        if (!replacement.ok || !hasNewCandidate) {
          discardSession(
            replacement.sessionId,
            "Partial discovery did not produce another source.",
          );
          return false;
        }

        cancelPlaybackSession(
          sessionId,
          "Trying sources returned after partial discovery.",
        );
        usePlaybackSessionStore.getState().removeSession(sessionId);
        launchOwnedSessionIdRef.current = replacement.sessionId;
        setPlaybackUri(null);
        setSessionStream(
          replacement.stream,
          replacement.mediaInfo,
          replacement.sessionId,
          replacement.candidateId,
          null,
          null,
          { type: "play" },
        );
        return true;
      })();
      partialReplanPromisesRef.current.set(replanKey, replan);
      try {
        return await replan;
      } finally {
        if (partialReplanPromisesRef.current.get(replanKey) === replan) {
          partialReplanPromisesRef.current.delete(replanKey);
        }
      }
    },
    [
      mediaInfo,
      setPlaybackUri,
      setRuntimeState,
      setSessionStream,
      setStreamStatus,
    ],
  );

  const tryAdvanceToFallback = useCallback(
    async (
      error: ReturnType<typeof createPlaybackRuntimeError>,
      reason?: string | null,
    ) => {
      if (fallbackInFlightRef.current) return true;
      recordDiagnostic({ type: "fallback" });
      const playerState = usePlayerStore.getState();
      const continuity = captureFallbackContinuity({
        currentTime: playerState.currentTime,
        isPlaying: playerState.isPlaying,
        sourceUri: `${playbackCandidateId || "legacy"}:${playbackUri || ""}`,
        attempt: ++fallbackAttemptRef.current,
      });
      pendingFallbackRestoreRef.current = continuity;
      dispatchRuntimeViewEvent({
        type: "fallback_started",
        resumeAt: continuity.resumeAt,
        attempt: continuity.attempt,
      });

      // A cache-ready response must not replace a source after fallback has
      // selected another candidate.
      abortSeekableHandoff();

      setFallbackStatusMessage(reason || getFallbackStatusMessage());
      setBuffering(true);
      setPlaying(false);
      setStreamStatus("loading_metrics");
      setRuntimeState("trying_fallback");
      fallbackInFlightRef.current = true;
      let fallbackAdvanced = false;

      try {
        if (playbackSessionId && playbackCandidateId && playbackAttemptId) {
          setPlaybackUri(null);
          const result = await advancePlaybackSessionAfterFailure(
            playbackSessionId,
            playbackCandidateId,
            playbackAttemptId,
            error,
          );
          if (!result.ok) {
            if (await tryReplanPartialPlayback(playbackSessionId)) {
              fallbackAdvanced = true;
              return true;
            }
            setRuntimeFailure(result.error);
            return false;
          }

          setSessionStream(
            result.stream,
            mediaInfo || undefined,
            result.sessionId,
            result.candidateId,
            result.attemptId,
            result.fallbackReason || reason || error.message,
          );
          setPlaybackUri(result.uri);
          fallbackAdvanced = true;
          return true;
        }

        const nextStream = advanceToNextFallback(reason);
        if (!nextStream) return false;

        requestLegacyFallback();
        fallbackAdvanced = true;
        return true;
      } finally {
        if (!fallbackAdvanced) pendingFallbackRestoreRef.current = null;
        fallbackInFlightRef.current = false;
      }
    },
    [
      abortSeekableHandoff,
      advanceToNextFallback,
      dispatchRuntimeViewEvent,
      getFallbackStatusMessage,
      mediaInfo,
      playbackAttemptId,
      playbackCandidateId,
      playbackSessionId,
      playbackUri,
      recordDiagnostic,
      requestLegacyFallback,
      setBuffering,
      setFallbackStatusMessage,
      setPlaying,
      setPlaybackUri,
      setRuntimeFailure,
      setRuntimeState,
      setSessionStream,
      setStreamStatus,
      tryReplanPartialPlayback,
    ],
  );

  useEffect(() => {
    if (!planningLaunchId) return;

    let active = true;
    const launch = getPlaybackLaunch(planningLaunchId);
    if (!launch) {
      setPlaybackPlanningFailure(
        planningLaunchId,
        createPlaybackRuntimeError(
          "SOURCE_UNAVAILABLE",
          "Playback planning expired. Try again to find a source.",
          { retryable: true, shouldFallback: false },
        ),
      );
      return;
    }

    void launch
      .then((result) => {
        if (!active) {
          discardSession(result.sessionId, "Playback launch was closed.");
          return;
        }

        if (!result.ok) {
          launchOwnedSessionIdRef.current = result.sessionId ?? null;
          releasePlaybackLaunch(planningLaunchId);
          setPlaybackPlanningFailure(
            planningLaunchId,
            result.error,
            result.sessionId,
          );
          return;
        }

        launchOwnedSessionIdRef.current = result.sessionId;
        setSessionStream(
          result.stream,
          result.mediaInfo,
          result.sessionId,
          result.candidateId,
          null,
          null,
          { type: "play" },
        );
        releasePlaybackLaunch(planningLaunchId);
        // Join the existing resolver single-flight. The player route may have
        // rendered after the launch completed, so this avoids a second pass.
        void resolvePlaybackSession(result.sessionId, result.candidateId)
          .then(async (resolution) => {
            const state = usePlayerStore.getState();
            if (state.playbackSessionId !== result.sessionId) return;
            if (!resolution.ok) {
              if (await tryReplanPartialPlayback(result.sessionId)) return;
              state.setRuntimeFailure(resolution.error);
              return;
            }
            state.setSessionStream(
              resolution.stream,
              result.mediaInfo,
              resolution.sessionId,
              resolution.candidateId,
              resolution.attemptId,
              resolution.fallbackReason,
            );
          })
          .catch((error) => {
            const state = usePlayerStore.getState();
            if (state.playbackSessionId !== result.sessionId) return;
            state.setRuntimeFailure(
              createPlaybackRuntimeError(
                "SOURCE_UNAVAILABLE",
                error instanceof Error
                  ? error.message
                  : "Could not prepare a source for playback.",
                { retryable: true, shouldFallback: false },
              ),
            );
          });
      })
      .catch((error) => {
        if (!active || isPlaybackLaunchCancelled(error)) return;
        setPlaybackPlanningFailure(
          planningLaunchId,
          createPlaybackRuntimeError(
            "SOURCE_UNAVAILABLE",
            error instanceof Error
              ? error.message
              : "Could not prepare a source for playback.",
            { retryable: true, shouldFallback: false },
          ),
        );
      });

    return () => {
      active = false;
    };
  }, [
    planningLaunchId,
    setPlaybackPlanningFailure,
    setSessionStream,
    tryReplanPartialPlayback,
  ]);

  useEffect(
    () => () => {
      cancelOwnedPlayback(
        "Player screen was closed before playback completed.",
      );
    },
    [cancelOwnedPlayback],
  );

  return {
    launchOwnedSessionIdRef,
    partialReplanControllerRef,
    fallbackInFlightRef,
    pendingFallbackRestoreRef,
    tryReplanPartialPlayback,
    cancelOwnedPlayback,
    getOwnedSessionId,
    tryAdvanceToFallback,
  };
}
