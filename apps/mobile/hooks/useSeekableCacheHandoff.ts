import { useEffect, type MutableRefObject } from "react";

import { usePlayerStore } from "../stores/playerStore";
import type { StreamLoadState } from "../stores/playerStore";
import { usePlaybackSessionStore } from "../stores/playbackSessionStore";
import type { PlaybackRuntimeState } from "@streamer/shared";
import { markPlaybackSessionPlaying } from "../services/playback/PlaybackSessionPlaybackService";
import {
  type SeekableHandoffVideoPlayer,
  replaceWithSeekableSource,
} from "../components/player/seekablePlaybackHandoff";
import type { SeekablePlaybackHandoff } from "../services/streamEngine/IStreamEngine";
import type { PlaybackDiagnosticEvent } from "../services/playback/PlaybackDiagnostics";
import type { PlaybackRuntimeViewEvent } from "../services/playback/PlaybackRuntimeCoordinator";

const SEEKABLE_CACHE_POLL_INTERVAL_MS = 2_000;

export type SeekableCacheStatus =
  | "not_started"
  | "evaluating"
  | "preparing"
  | "ready"
  | "unavailable";

type SeekableCacheEngine = {
  getSeekablePlaybackHandoff?: (options?: {
    expectedGatewayJobId?: string;
    signal?: AbortSignal;
  }) => Promise<SeekablePlaybackHandoff>;
};

interface UseSeekableCacheHandoffOptions {
  player: SeekableHandoffVideoPlayer | null;
  playbackUri: string | null;
  engine: SeekableCacheEngine | null;
  isProgressiveRemuxPlayback: boolean;
  hasPlaybackStarted: boolean;
  playbackSessionId: string | null;
  playbackCandidateId: string | null;
  playbackAttemptId: string | null;
  playbackDelivery?: string | null;
  activeCast: unknown;
  seekableHandoffApplied: boolean;
  preparedBridgeJobId?: string | null;
  activeGatewayJobId?: string | null;
  controllerRef: MutableRefObject<AbortController | null>;
  handoffInFlightRef: MutableRefObject<boolean>;
  handoffShouldResumeRef: MutableRefObject<boolean | null>;
  pausedAfterHandoffRef: MutableRefObject<boolean>;
  setSeekableCacheStatus: (status: SeekableCacheStatus) => void;
  setSeekableHandoffApplied: (applied: boolean) => void;
  recordDiagnostic: (event: PlaybackDiagnosticEvent) => void;
  dispatchRuntimeViewEvent: (event: PlaybackRuntimeViewEvent) => void;
  setBuffering: (buffering: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setRuntimeState: (state: PlaybackRuntimeState) => void;
  setStreamStatus: (status: StreamLoadState) => void;
  beginProgressSourceReplacement: () => void;
  completeProgressSourceReplacement: (position: number) => void;
}

function waitForSeekableCachePoll(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, SEEKABLE_CACHE_POLL_INTERVAL_MS);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Observes the session-owned seekable cache handoff and performs the single
 * in-attempt source replacement when the prepared gateway job is ready.
 *
 * The hook deliberately re-checks player and session ownership after every
 * await. A late gateway response must never replace a source selected by a
 * newer attempt, candidate, or session.
 */
export function useSeekableCacheHandoff({
  player,
  playbackUri,
  engine,
  isProgressiveRemuxPlayback,
  hasPlaybackStarted,
  playbackSessionId,
  playbackCandidateId,
  playbackAttemptId,
  playbackDelivery,
  activeCast,
  seekableHandoffApplied,
  preparedBridgeJobId,
  activeGatewayJobId,
  controllerRef,
  handoffInFlightRef,
  handoffShouldResumeRef,
  pausedAfterHandoffRef,
  setSeekableCacheStatus,
  setSeekableHandoffApplied,
  recordDiagnostic,
  dispatchRuntimeViewEvent,
  setBuffering,
  setPlaying,
  setRuntimeState,
  setStreamStatus,
  beginProgressSourceReplacement,
  completeProgressSourceReplacement,
}: UseSeekableCacheHandoffOptions) {
  useEffect(() => {
    if (
      !player ||
      !playbackUri ||
      !engine?.getSeekablePlaybackHandoff ||
      !isProgressiveRemuxPlayback ||
      !hasPlaybackStarted ||
      !playbackSessionId ||
      !playbackCandidateId ||
      !playbackAttemptId ||
      activeCast ||
      seekableHandoffApplied
    ) {
      return;
    }

    const getSeekablePlaybackHandoff =
      engine.getSeekablePlaybackHandoff.bind(engine);
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const sessionSnapshot = {
      sessionId: playbackSessionId,
      candidateId: playbackCandidateId,
      attemptId: playbackAttemptId,
    };
    // The opaque gateway ID is already session-owned state, so using it here
    // prevents a late monitor from ever observing a gateway job selected by a
    // different candidate or player.
    let expectedGatewayJobId: string | undefined =
      preparedBridgeJobId || activeGatewayJobId || undefined;

    const isCurrentAttempt = () => {
      const state = usePlayerStore.getState();
      const currentSession =
        usePlaybackSessionStore.getState().sessions[sessionSnapshot.sessionId];
      return (
        state.playbackSessionId === sessionSnapshot.sessionId &&
        state.playbackCandidateId === sessionSnapshot.candidateId &&
        state.playbackAttemptId === sessionSnapshot.attemptId &&
        currentSession?.selectedCandidateId === sessionSnapshot.candidateId &&
        currentSession.status !== "cancelled" &&
        currentSession.status !== "failed" &&
        currentSession.status !== "completed" &&
        (playbackDelivery === "progressive-fmp4" ||
          state.currentStream?.behaviorHints?.remuxStrategy ===
            "progressive-fmp4")
      );
    };

    const markSeekableHandoffUnavailable = () => {
      if (controller.signal.aborted || !isCurrentAttempt()) return;
      // A seekable cache is an enhancement to the already-live fMP4. If the
      // replacement cannot be completed, keep that candidate alive; a real
      // player error will still follow the normal serial fallback path.
      setSeekableCacheStatus("unavailable");
      recordDiagnostic({
        type: "seekable_handoff",
        state: "unavailable",
      });
      if (player.playing) {
        setBuffering(false);
        setPlaying(true);
        setStreamStatus("playing");
        markPlaybackSessionPlaying(sessionSnapshot.sessionId);
      }
    };

    const monitor = async () => {
      while (!controller.signal.aborted && isCurrentAttempt()) {
        let handoff: SeekablePlaybackHandoff;
        try {
          handoff = await getSeekablePlaybackHandoff({
            expectedGatewayJobId,
            signal: controller.signal,
          });
        } catch {
          // The live stream remains valid when a status request has a
          // transient network failure. Keep the monitor bounded and try the
          // same gateway job again instead of treating cache observability as
          // a playback failure.
          if (controller.signal.aborted) return;
          await waitForSeekableCachePoll(controller.signal);
          continue;
        }

        if (controller.signal.aborted || !isCurrentAttempt()) return;
        if (
          expectedGatewayJobId &&
          handoff.gatewayJobId &&
          handoff.gatewayJobId !== expectedGatewayJobId
        ) {
          return;
        }
        expectedGatewayJobId = handoff.gatewayJobId ?? expectedGatewayJobId;
        setSeekableCacheStatus(handoff.status);

        if (handoff.status === "unavailable") {
          recordDiagnostic({
            type: "seekable_handoff",
            state: "unavailable",
          });
          return;
        }
        if (handoff.status !== "ready" || !handoff.uri) {
          await waitForSeekableCachePoll(controller.signal);
          continue;
        }
        recordDiagnostic({ type: "seekable_handoff", state: "ready" });

        const resumeAt = Number.isFinite(player.currentTime)
          ? Math.max(0, player.currentTime)
          : 0;
        const shouldResume = Boolean(player.playing);
        handoffInFlightRef.current = true;
        handoffShouldResumeRef.current = shouldResume;
        pausedAfterHandoffRef.current = !shouldResume;
        recordDiagnostic({ type: "seekable_handoff", state: "started" });
        dispatchRuntimeViewEvent({
          type: "source_replacement_started",
          reason: "seekable_handoff",
          resumeAt,
        });
        setBuffering(true);
        setRuntimeState("buffering");
        beginProgressSourceReplacement();
        let replacementCompleted = false;
        try {
          await replaceWithSeekableSource({
            player,
            source: handoff.uri,
            resumeAt,
            shouldResume,
            signal: controller.signal,
          });
          if (controller.signal.aborted || !isCurrentAttempt()) return;
          completeProgressSourceReplacement(resumeAt);
          replacementCompleted = true;
          dispatchRuntimeViewEvent({
            type: "source_replacement_completed",
          });
          setSeekableHandoffApplied(true);
          setSeekableCacheStatus("ready");
          recordDiagnostic({
            type: "seekable_handoff",
            state: "completed",
          });
          return;
        } catch {
          completeProgressSourceReplacement(resumeAt);
          replacementCompleted = true;
          dispatchRuntimeViewEvent({
            type: "source_replacement_completed",
          });
          markSeekableHandoffUnavailable();
          return;
        } finally {
          if (!replacementCompleted) {
            completeProgressSourceReplacement(resumeAt);
          }
          handoffInFlightRef.current = false;
          handoffShouldResumeRef.current = null;
          if (shouldResume) {
            pausedAfterHandoffRef.current = false;
          }
        }
      }
    };

    void monitor();
    return () => {
      controller.abort();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [
    activeCast,
    activeGatewayJobId,
    beginProgressSourceReplacement,
    completeProgressSourceReplacement,
    controllerRef,
    dispatchRuntimeViewEvent,
    engine,
    hasPlaybackStarted,
    handoffInFlightRef,
    handoffShouldResumeRef,
    isProgressiveRemuxPlayback,
    pausedAfterHandoffRef,
    playbackAttemptId,
    playbackCandidateId,
    playbackDelivery,
    playbackSessionId,
    playbackUri,
    player,
    preparedBridgeJobId,
    recordDiagnostic,
    seekableHandoffApplied,
    setBuffering,
    setPlaying,
    setRuntimeState,
    setSeekableCacheStatus,
    setSeekableHandoffApplied,
    setStreamStatus,
  ]);
}
