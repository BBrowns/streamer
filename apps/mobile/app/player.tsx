import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import {
  VideoView,
  isPictureInPictureSupported,
  useVideoPlayer,
} from "expo-video";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";

import { useTheme } from "../hooks/useTheme";
import { usePlayerStore } from "../stores/playerStore";
import { usePlaybackSessionStore } from "../stores/playbackSessionStore";
import {
  isTaskOfflinePlayable,
  useDownloadStore,
} from "../stores/downloadStore";
import {
  getPlayerEscapeAction,
  usePlayerHotkeys,
} from "../hooks/usePlayerHotkeys";
import { streamEngineManager } from "../services/streamEngine/StreamEngineManager";
import { usePlayerController } from "../hooks/usePlayerController";

// UI Components
import { PlayerOverlay } from "../components/player/PlayerOverlay";
import { PlayerSettingsModal } from "../components/player/PlayerSettingsModal";
import { PlayerStatusOverlay } from "../components/player/PlayerStatusOverlay";
import { PlayerControls } from "../components/player/PlayerControls";
import { PlayerInteractionLayer } from "../components/player/PlayerInteractionLayer";
import { NextEpisodeOverlay } from "../components/player/NextEpisodeOverlay";
import { ResumePrompt } from "../components/player/ResumePrompt";
import { DesktopCastModal } from "../components/DesktopCastModal";
import { goBackOrReplace } from "../lib/navigation";
import { getUnsupportedWebCodecReason } from "../services/streamEngine/codecSupport";
import {
  createPlaybackRuntimeError,
  mapPlaybackMessageToRuntimeFailure,
} from "../services/playback/PlaybackErrors";
import {
  buildTrackRows,
  findPlayerTrackByRowId,
  findPreferredPlayerTrack,
} from "../services/playback/trackSelection";
import {
  playBest,
  type PlaybackOrchestratorResult,
} from "../services/playback/PlaybackOrchestrator";
import {
  beginPlaybackLaunch,
  cancelPlaybackLaunch,
  getPlaybackLaunch,
  isPlaybackLaunchCancelled,
  releasePlaybackLaunch,
} from "../services/playback/PlaybackLaunchService";
import {
  advancePlaybackSessionAfterFailure,
  cancelPlaybackSession,
  markPlaybackSessionBuffering,
  markPlaybackSessionPlaying,
  resolvePlaybackSession,
} from "../services/playback/PlaybackSessionPlaybackService";
import { stopCastSession } from "../services/playback/PlaybackSessionCastService";
import { useCastStore } from "../stores/castStore";
import { PlaybackStatusPanel } from "../components/ui/PlaybackStatusPanel";
import { hasNewStablePlaybackCandidate } from "../services/playback/partialDiscovery";

const DOUBLE_TAP_DELAY = 300;
const SEEK_SECONDS = 10;
const PLAYBACK_START_TIMEOUT_MS = 60_000;

export default function PlayerScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const currentStream = usePlayerStore((s) => s.currentStream);
  const mediaInfo = usePlayerStore((s) => s.mediaInfo);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const streamState = usePlayerStore((s) => s.streamState);
  const streamMetrics = usePlayerStore((s) => s.streamMetrics);
  const errorMessage = usePlayerStore((s) => s.errorMessage);
  const runtimeState = usePlayerStore((s) => s.runtimeState);
  const runtimeError = usePlayerStore((s) => s.runtimeError);
  const fallbackReason = usePlayerStore((s) => s.fallbackReason);
  const playbackSessionId = usePlayerStore((s) => s.playbackSessionId);
  const playbackCandidateId = usePlayerStore((s) => s.playbackCandidateId);
  const playbackAttemptId = usePlayerStore((s) => s.playbackAttemptId);
  const playbackLaunchIntent = usePlayerStore((s) => s.playbackLaunchIntent);
  const clearPlayer = usePlayerStore((s) => s.clearPlayer);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const preferredAudioLang = usePlayerStore((s) => s.preferredAudioLang);
  const preferredSubtitleLang = usePlayerStore((s) => s.preferredSubtitleLang);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setBuffering = usePlayerStore((s) => s.setBuffering);
  const setStreamStatus = usePlayerStore((s) => s.setStreamStatus);
  const setRuntimeState = usePlayerStore((s) => s.setRuntimeState);
  const setRuntimeFailure = usePlayerStore((s) => s.setRuntimeFailure);
  const setSessionStream = usePlayerStore((s) => s.setSessionStream);
  const setPlaybackPlanning = usePlayerStore((s) => s.setPlaybackPlanning);
  const setPlaybackPlanningFailure = usePlayerStore(
    (s) => s.setPlaybackPlanningFailure,
  );
  const advanceToNextFallback = usePlayerStore((s) => s.advanceToNextFallback);
  const activeSession = usePlaybackSessionStore((s) =>
    playbackSessionId ? s.sessions[playbackSessionId] || null : null,
  );
  const activeCast = useCastStore((s) => s.activeCast);
  const setActiveCast = useCastStore((s) => s.setActiveCast);
  const clearActiveCast = useCastStore((s) => s.clearActiveCast);
  const planningLaunchId =
    playbackLaunchIntent?.type === "planning"
      ? playbackLaunchIntent.launchId
      : null;
  // Planning failures are first written to the session store. Prefer that
  // terminal error so the recovery action remains available during the render
  // in which the player store has not yet published runtimeError.
  const effectivePlaybackError = activeSession?.terminalError || runtimeError;
  const shouldOfferSourcesDevicesRecovery =
    effectivePlaybackError?.code === "BRIDGE_UNAVAILABLE" ||
    effectivePlaybackError?.code === "BRIDGE_UNSUPPORTED" ||
    runtimeState === "failed_bridge_unavailable" ||
    runtimeState === "failed_bridge_unsupported";
  const downloadTask = useDownloadStore((s) => {
    if (!mediaInfo) return null;
    return (
      Object.values(s.tasks).find(
        (task) =>
          task.mediaInfo.itemId === mediaInfo.itemId &&
          task.mediaInfo.type === mediaInfo.type &&
          task.mediaInfo.season === mediaInfo.season &&
          task.mediaInfo.episode === mediaInfo.episode,
      ) || null
    );
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [previewControls, setPreviewControls] = useState(false);

  const [seekFeedback, setSeekFeedback] = useState<"left" | "right" | null>(
    null,
  );
  const lastTapRef = useRef<{ time: number; side: "left" | "right" } | null>(
    null,
  );
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoViewRef = useRef<any>(null);
  const fallbackInFlightRef = useRef(false);
  const appliedTrackPreferencesRef = useRef<string | null>(null);
  // A fast launch can create its session between renders. Keep explicit
  // ownership so an immediate route close cannot miss that session before
  // React has published its id through the player store.
  const launchOwnedSessionIdRef = useRef<string | null>(null);
  const activePlanningLaunchIdRef = useRef<string | null>(planningLaunchId);
  const activePlaybackSessionIdRef = useRef<string | null>(playbackSessionId);
  const partialReplanAttemptsRef = useRef(new Set<string>());
  const partialReplanPromisesRef = useRef(new Map<string, Promise<boolean>>());
  const partialReplanControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    activePlanningLaunchIdRef.current = planningLaunchId;
  }, [planningLaunchId]);

  useEffect(() => {
    activePlaybackSessionIdRef.current = playbackSessionId;
  }, [playbackSessionId]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(
      () => setControlsVisible(false),
      4000,
    );
  }, []);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      setControlsVisible(false);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    } else {
      showControls();
    }
  }, [controlsVisible, showControls]);

  const leavePlayer = useCallback(
    (reason: string) => {
      partialReplanControllerRef.current?.abort();
      partialReplanControllerRef.current = null;
      if (activeCast) {
        void stopCastSession(activeCast.device.id, activeCast.sessionId).catch(
          (error) => console.error("Failed to stop cast", error),
        );
        clearActiveCast();
      }
      if (planningLaunchId) {
        cancelPlaybackLaunch(planningLaunchId, reason);
      }
      const sessionId = playbackSessionId || launchOwnedSessionIdRef.current;
      if (sessionId) {
        cancelPlaybackSession(sessionId, reason);
        if (planningLaunchId || launchOwnedSessionIdRef.current === sessionId) {
          usePlaybackSessionStore.getState().removeSession(sessionId);
          if (launchOwnedSessionIdRef.current === sessionId) {
            launchOwnedSessionIdRef.current = null;
          }
        }
      } else if (currentStream) {
        streamEngineManager.resolveEngine(currentStream)?.stop?.();
      }
      goBackOrReplace(router);
      setTimeout(() => clearPlayer(), 100);
    },
    [
      activeCast,
      clearActiveCast,
      clearPlayer,
      currentStream,
      planningLaunchId,
      playbackSessionId,
      router,
    ],
  );

  const handleClose = useCallback(
    () => leavePlayer("User left the player."),
    [leavePlayer],
  );

  const handleCancelPreparation = useCallback(
    () => leavePlayer("User cancelled source preparation."),
    [leavePlayer],
  );

  const handleBrowseTitles = useCallback(() => {
    clearPlayer();
    router.replace("/search");
  }, [clearPlayer, router]);

  const handleOpenSourcesDevices = useCallback(() => {
    partialReplanControllerRef.current?.abort();
    partialReplanControllerRef.current = null;
    if (planningLaunchId) {
      cancelPlaybackLaunch(planningLaunchId, "User opened Sources & Devices.");
    }
    const sessionId = playbackSessionId || launchOwnedSessionIdRef.current;
    if (sessionId) {
      cancelPlaybackSession(sessionId, "User opened Sources & Devices.");
      usePlaybackSessionStore.getState().removeSession(sessionId);
      if (launchOwnedSessionIdRef.current === sessionId) {
        launchOwnedSessionIdRef.current = null;
      }
    }
    clearPlayer();
    router.replace("/settings/sources");
  }, [clearPlayer, planningLaunchId, playbackSessionId, router]);

  const handleChooseSource = useCallback(() => {
    if (!mediaInfo) return;
    partialReplanControllerRef.current?.abort();
    partialReplanControllerRef.current = null;
    if (planningLaunchId) {
      cancelPlaybackLaunch(
        planningLaunchId,
        "User chose advanced source selection.",
      );
    }
    const sessionId = playbackSessionId || launchOwnedSessionIdRef.current;
    if (sessionId) {
      cancelPlaybackSession(sessionId, "User chose advanced source selection.");
      if (planningLaunchId || launchOwnedSessionIdRef.current === sessionId) {
        usePlaybackSessionStore.getState().removeSession(sessionId);
        if (launchOwnedSessionIdRef.current === sessionId) {
          launchOwnedSessionIdRef.current = null;
        }
      }
    }
    const target = {
      pathname: "/detail/[type]/[id]",
      params: {
        type: mediaInfo.type,
        id: mediaInfo.itemId,
        sources: "1",
      },
    } as const;
    clearPlayer();
    router.replace(target as any);
  }, [clearPlayer, mediaInfo, planningLaunchId, playbackSessionId, router]);

  useEffect(
    () => () => {
      partialReplanControllerRef.current?.abort();
      partialReplanControllerRef.current = null;
      const launchId = activePlanningLaunchIdRef.current;
      if (launchId) {
        cancelPlaybackLaunch(
          launchId,
          "Player screen was closed before planning completed.",
        );
      }
      const sessionId =
        launchOwnedSessionIdRef.current || activePlaybackSessionIdRef.current;
      if (sessionId) {
        cancelPlaybackSession(
          sessionId,
          "Player screen was closed before playback completed.",
        );
        if (launchOwnedSessionIdRef.current === sessionId) {
          usePlaybackSessionStore.getState().removeSession(sessionId);
          launchOwnedSessionIdRef.current = null;
        }
      }
    },
    [],
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
        // A terminal session takes precedence in PlayerStatusOverlay. Remove
        // it before waiting for the warmed discovery cache so this recovery
        // stays visibly cancellable instead of presenting a stale error.
        usePlaybackSessionStore.getState().removeSession(sessionId);
        if (launchOwnedSessionIdRef.current === sessionId) {
          launchOwnedSessionIdRef.current = null;
        }
        const controller = new AbortController();
        partialReplanControllerRef.current = controller;
        setPlaybackUri(null);
        setStreamStatus("loading_metrics");
        setRuntimeState("planning");
        let replacement: PlaybackOrchestratorResult;
        try {
          replacement = await playBest(
            {
              type: mediaInfo.type,
              id: mediaInfo.itemId,
              title: mediaInfo.title,
              poster: mediaInfo.poster,
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
          // Escape/Close owns this controller. Treat its late rejection as
          // handled so the resolver cannot repaint an error after navigation.
          return controller.signal.aborted;
        } finally {
          if (partialReplanControllerRef.current === controller) {
            partialReplanControllerRef.current = null;
          }
        }

        if (controller.signal.aborted) {
          if (replacement.sessionId) {
            cancelPlaybackSession(
              replacement.sessionId,
              "Partial discovery recovery was cancelled.",
            );
            usePlaybackSessionStore
              .getState()
              .removeSession(replacement.sessionId);
          }
          return true;
        }

        const replacementCandidates = replacement.plan?.orderedCandidates ?? [];
        const hasNewCandidate = hasNewStablePlaybackCandidate(
          previousPlan.orderedCandidates,
          replacementCandidates,
        );

        // A retry can reach the same server-side fast promise before late
        // providers finish. Never restart playback with exactly the same
        // source identity just because the planner minted another UUID.
        if (!replacement.ok || !hasNewCandidate) {
          if (replacement.sessionId) {
            cancelPlaybackSession(
              replacement.sessionId,
              "Partial discovery did not produce another source.",
            );
            usePlaybackSessionStore
              .getState()
              .removeSession(replacement.sessionId);
          }
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
    [mediaInfo, setRuntimeState, setSessionStream, setStreamStatus],
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
          if (result.sessionId) {
            cancelPlaybackSession(
              result.sessionId,
              "Playback launch was closed.",
            );
            usePlaybackSessionStore.getState().removeSession(result.sessionId);
          }
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
        // Start the existing session resolver immediately. The player effect
        // joins its single-flight promise after the route has rendered. If it
        // wins that race, publish the result into the same runtime store so a
        // second resolver pass is never needed.
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

  // Cast sessions intentionally outlive this route. They only stop after an
  // explicit stop/close action, so navigation cannot silently end playback.

  const handleRetryPlayback = useCallback(async () => {
    partialReplanControllerRef.current?.abort();
    partialReplanControllerRef.current = null;
    if (!currentStream && planningLaunchId && mediaInfo) {
      if (playbackSessionId) {
        cancelPlaybackSession(
          playbackSessionId,
          "User retried playback planning.",
        );
        usePlaybackSessionStore.getState().removeSession(playbackSessionId);
        if (launchOwnedSessionIdRef.current === playbackSessionId) {
          launchOwnedSessionIdRef.current = null;
        }
      }
      cancelPlaybackLaunch(planningLaunchId, "User retried playback planning.");
      const launchId = beginPlaybackLaunch({
        type: mediaInfo.type,
        id: mediaInfo.itemId,
        title: mediaInfo.title,
        poster: mediaInfo.poster,
        season: mediaInfo.season,
        episode: mediaInfo.episode,
      });
      setPlaybackPlanning(mediaInfo, launchId);
      return;
    }

    if (!currentStream) return;

    if (playbackSessionId && mediaInfo) {
      cancelPlaybackSession(playbackSessionId, "User retried playback.");
      setPlaybackUri(null);
      setStreamStatus("loading_metrics");
      const result = await playBest(
        {
          type: mediaInfo.type,
          id: mediaInfo.itemId,
          title: mediaInfo.title,
          poster: mediaInfo.poster,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
        },
        { forceRefresh: true },
      );
      if (result.ok) {
        launchOwnedSessionIdRef.current = result.sessionId;
        setSessionStream(
          result.stream,
          result.mediaInfo,
          result.sessionId,
          result.candidateId,
        );
      } else {
        setRuntimeFailure(result.error);
      }
      return;
    }

    setPlaybackUri(null);
    setStreamStatus("loading_metrics");
    if (currentStream.infoHash) {
      await streamEngineManager.detectBridge();
    }
    setResolveAttempt((attempt) => attempt + 1);
  }, [
    currentStream,
    mediaInfo,
    planningLaunchId,
    playbackSessionId,
    setPlaybackPlanning,
    setRuntimeFailure,
    setSessionStream,
    setStreamStatus,
  ]);

  const tryAdvanceToFallback = useCallback(
    async (
      error: ReturnType<typeof createPlaybackRuntimeError>,
      reason?: string | null,
    ) => {
      if (playbackSessionId && playbackCandidateId && playbackAttemptId) {
        if (fallbackInFlightRef.current) return true;

        fallbackInFlightRef.current = true;
        setPlaybackUri(null);
        try {
          const result = await advancePlaybackSessionAfterFailure(
            playbackSessionId,
            playbackCandidateId,
            playbackAttemptId,
            error,
          );
          if (!result.ok) {
            if (await tryReplanPartialPlayback(playbackSessionId)) {
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
          return true;
        } finally {
          fallbackInFlightRef.current = false;
        }
      }

      const nextStream = advanceToNextFallback(reason);
      if (!nextStream) return false;

      setPlaybackUri(null);
      setResolveAttempt((attempt) => attempt + 1);
      return true;
    },
    [
      advanceToNextFallback,
      mediaInfo,
      playbackAttemptId,
      playbackCandidateId,
      playbackSessionId,
      setRuntimeFailure,
      setSessionStream,
      tryReplanPartialPlayback,
    ],
  );

  // Effect to resolve playback URI
  useEffect(() => {
    let isMounted = true;
    const resolve = async () => {
      if (!currentStream) {
        setPlaybackUri(null);
        return;
      }

      if (
        playbackSessionId &&
        playbackCandidateId &&
        playbackAttemptId &&
        currentStream.url
      ) {
        setPlaybackUri(currentStream.url);
        return;
      }

      setStreamStatus("loading_metrics");

      if (playbackSessionId) {
        const result = await resolvePlaybackSession(
          playbackSessionId,
          playbackCandidateId || undefined,
        );
        if (!isMounted) return;

        if (!result.ok) {
          if (await tryReplanPartialPlayback(playbackSessionId)) return;
          setPlaybackUri(null);
          setRuntimeFailure(result.error);
          return;
        }

        setSessionStream(
          result.stream,
          mediaInfo || undefined,
          result.sessionId,
          result.candidateId,
          result.attemptId,
          result.fallbackReason,
        );
        setPlaybackUri(result.uri);
        return;
      }

      const unsupportedCodecReason =
        getUnsupportedWebCodecReason(currentStream);
      if (unsupportedCodecReason) {
        const message = t("player.errors.unsupportedCodec");
        const error = createPlaybackRuntimeError("UNSUPPORTED_CODEC", message, {
          retryable: false,
          shouldFallback: false,
        });
        if (await tryAdvanceToFallback(error, message)) return;
        if (!isMounted) return;
        setPlaybackUri(null);
        setRuntimeFailure(error);
        return;
      }

      try {
        const uri = await streamEngineManager.getPlaybackUri(currentStream);
        if (!isMounted) return;

        if (uri && uri.length > 0) {
          setPlaybackUri(uri);
          return;
        }

        const message = currentStream.infoHash
          ? t("player.errors.bridgeUnavailable")
          : t("player.errors.noStream");
        const error = createPlaybackRuntimeError(
          currentStream.infoHash ? "BRIDGE_UNAVAILABLE" : "SOURCE_UNAVAILABLE",
          message,
          { retryable: true, shouldFallback: false },
        );
        if (await tryAdvanceToFallback(error, message)) return;

        setPlaybackUri(null);
        setRuntimeFailure(error);
      } catch (err: any) {
        if (!isMounted) return;
        const message = err?.message || t("player.errors.playbackFailed");
        const error = mapPlaybackMessageToRuntimeFailure(
          message,
          currentStream.infoHash ? "BRIDGE_UNAVAILABLE" : "SOURCE_UNAVAILABLE",
          { retryable: true, shouldFallback: false },
        ).error;
        if (await tryAdvanceToFallback(error, message)) return;

        setPlaybackUri(null);
        setRuntimeFailure(error);
      }
    };

    void resolve();
    return () => {
      isMounted = false;
    };
  }, [
    currentStream,
    mediaInfo,
    playbackAttemptId,
    playbackCandidateId,
    playbackSessionId,
    resolveAttempt,
    setRuntimeFailure,
    setSessionStream,
    setStreamStatus,
    t,
    tryAdvanceToFallback,
    tryReplanPartialPlayback,
  ]);

  useEffect(() => {
    if (
      !playbackSessionId ||
      !playbackCandidateId ||
      !playbackAttemptId ||
      !runtimeError ||
      streamState !== "error" ||
      !activeSession ||
      activeSession.status === "failed" ||
      activeSession.status === "cancelled" ||
      activeSession.status === "completed"
    ) {
      return;
    }

    void tryAdvanceToFallback(runtimeError, runtimeError.message);
  }, [
    activeSession,
    playbackAttemptId,
    playbackCandidateId,
    playbackSessionId,
    runtimeError,
    streamState,
    tryAdvanceToFallback,
  ]);

  const player = useVideoPlayer(playbackUri || "", (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.play();
  });

  useEffect(() => {
    if (!player || !playbackUri || !currentStream) return;

    player.timeUpdateEventInterval = 1;
    setBuffering(true);

    const markLoading = () => {
      if (playbackSessionId) {
        markPlaybackSessionBuffering(playbackSessionId);
      }
      const state = usePlayerStore.getState();
      if (state.streamState === "playing") {
        setBuffering(true);
        setRuntimeState("buffering");
      } else if (state.streamState !== "error") {
        setStreamStatus("loading_metrics");
      }
    };

    const markPlaying = () => {
      if (playbackSessionId) {
        markPlaybackSessionPlaying(playbackSessionId);
      }
      setBuffering(false);
      setPlaying(true);
      setStreamStatus("playing");
    };

    const formatPlaybackError = (fallback?: string) => {
      const unsupportedCodecReason =
        getUnsupportedWebCodecReason(currentStream);
      if (unsupportedCodecReason) {
        return t("player.errors.unsupportedCodec");
      }
      return fallback || t("player.errors.playbackFailed");
    };

    const statusSub = player.addListener(
      "statusChange",
      ({ status, error }: any) => {
        if (status === "loading") {
          markLoading();
          return;
        }

        if (status === "readyToPlay") {
          markPlaying();
          return;
        }

        if (status === "error") {
          const message = formatPlaybackError(error?.message);
          const runtimeFailure = mapPlaybackMessageToRuntimeFailure(
            message,
            "SOURCE_UNAVAILABLE",
            {
              retryable: true,
              shouldFallback: false,
            },
          ).error;
          void tryAdvanceToFallback(runtimeFailure, message).then(
            (advanced) => {
              if (advanced) return;
              setBuffering(false);
              setPlaying(false);
              setRuntimeFailure(runtimeFailure);
            },
          );
        }
      },
    );

    const playingSub = player.addListener(
      "playingChange",
      ({ isPlaying }: any) => {
        setPlaying(isPlaying);
        if (isPlaying) markPlaying();
      },
    );

    const timeSub = player.addListener("timeUpdate", ({ currentTime }: any) => {
      if (currentTime > 0 || player.bufferedPosition > 0) {
        markPlaying();
      }
    });

    const sourceSub = player.addListener("sourceLoad", () => {
      if (player.status === "readyToPlay") {
        markPlaying();
      }
    });

    const remainingSessionBudgetMs = activeSession
      ? Math.max(
          0,
          Date.parse(activeSession.createdAt) +
            activeSession.timeoutBudgetMs -
            Date.now(),
        )
      : PLAYBACK_START_TIMEOUT_MS;
    const watchdogTimeoutMs = Math.min(
      PLAYBACK_START_TIMEOUT_MS,
      remainingSessionBudgetMs,
    );
    const watchdog = setTimeout(() => {
      const state = usePlayerStore.getState();
      if (
        state.currentStream !== currentStream ||
        state.streamState === "playing" ||
        state.streamState === "error"
      ) {
        return;
      }

      const message = formatPlaybackError(t("player.errors.playbackTimeout"));
      const timeoutError = createPlaybackRuntimeError(
        "PLAYBACK_TIMEOUT",
        message,
        {
          retryable: true,
          shouldFallback: false,
        },
      );
      void tryAdvanceToFallback(timeoutError, message).then((advanced) => {
        if (advanced) return;
        setBuffering(false);
        setPlaying(false);
        setRuntimeFailure(timeoutError);
      });
    }, watchdogTimeoutMs);

    return () => {
      statusSub.remove();
      playingSub.remove();
      timeSub.remove();
      sourceSub.remove();
      clearTimeout(watchdog);
    };
  }, [
    currentStream,
    activeSession,
    playbackUri,
    playbackSessionId,
    player,
    setBuffering,
    setPlaying,
    setRuntimeState,
    setStreamStatus,
    setRuntimeFailure,
    t,
    tryAdvanceToFallback,
  ]);

  const {
    audioTracks,
    subtitles,
    stats,
    engine,
    showResumePrompt,
    resumePromptTimeSeconds,
    handleResumeResponse,
    showNextEpisodeOverlay,
    setShowNextEpisodeOverlay,
    handleNextEpisode,
    setAudioTracks,
    setSubtitles,
    nextEpisode,
  } = usePlayerController({
    player,
    playbackUri,
    onClose: handleClose,
    showControls,
  });

  const refreshPlayerTracks = useCallback(() => {
    if (!player) return;

    const availableAudioTracks = player.availableAudioTracks || [];
    const availableSubtitleTracks = player.availableSubtitleTracks || [];

    if (availableAudioTracks.length > 0) {
      setAudioTracks(
        buildTrackRows(availableAudioTracks, player.audioTrack, "audio"),
      );
    } else if (engine) {
      setAudioTracks(engine.getAudioTracks());
    } else {
      setAudioTracks([]);
    }

    if (availableSubtitleTracks.length > 0) {
      setSubtitles(
        buildTrackRows(
          availableSubtitleTracks,
          player.subtitleTrack,
          "subtitle",
        ),
      );
    } else if (engine) {
      setSubtitles(engine.getSubtitles());
    } else {
      setSubtitles([]);
    }
  }, [engine, player, setAudioTracks, setSubtitles]);

  useEffect(() => {
    appliedTrackPreferencesRef.current = null;
    setAudioTracks(engine?.getAudioTracks() || []);
    setSubtitles(engine?.getSubtitles() || []);
  }, [engine, playbackUri, setAudioTracks, setSubtitles]);

  useEffect(() => {
    if (!player) return;

    refreshPlayerTracks();

    const audioListSub = player.addListener?.(
      "availableAudioTracksChange",
      refreshPlayerTracks,
    );
    const audioTrackSub = player.addListener?.(
      "audioTrackChange",
      refreshPlayerTracks,
    );
    const subtitleListSub = player.addListener?.(
      "availableSubtitleTracksChange",
      refreshPlayerTracks,
    );
    const subtitleTrackSub = player.addListener?.(
      "subtitleTrackChange",
      refreshPlayerTracks,
    );
    const sourceLoadSub = player.addListener?.(
      "sourceLoad",
      refreshPlayerTracks,
    );

    return () => {
      audioListSub?.remove?.();
      audioTrackSub?.remove?.();
      subtitleListSub?.remove?.();
      subtitleTrackSub?.remove?.();
      sourceLoadSub?.remove?.();
    };
  }, [player, refreshPlayerTracks]);

  useEffect(() => {
    if (!player || !playbackUri) return;
    if (appliedTrackPreferencesRef.current === playbackUri) return;

    const availableAudioTracks = player.availableAudioTracks || [];
    const availableSubtitleTracks = player.availableSubtitleTracks || [];
    const waitingForPreferredAudio =
      Boolean(preferredAudioLang) && availableAudioTracks.length === 0;
    const waitingForPreferredSubtitles =
      Boolean(preferredSubtitleLang) && availableSubtitleTracks.length === 0;
    if (waitingForPreferredAudio || waitingForPreferredSubtitles) return;

    const audioTrack = findPreferredPlayerTrack(
      availableAudioTracks,
      preferredAudioLang,
    );
    if (audioTrack) {
      player.audioTrack = audioTrack;
    }

    const subtitleTrack = findPreferredPlayerTrack(
      availableSubtitleTracks,
      preferredSubtitleLang,
    );
    if (subtitleTrack) {
      player.subtitleTrack = subtitleTrack;
    }

    appliedTrackPreferencesRef.current = playbackUri;
    refreshPlayerTracks();
  }, [
    player,
    playbackUri,
    audioTracks.length,
    preferredAudioLang,
    preferredSubtitleLang,
    refreshPlayerTracks,
    subtitles.length,
  ]);

  const selectedSessionCandidate = useMemo(() => {
    const candidateId =
      activeSession?.selectedCandidateId || playbackCandidateId;
    if (!activeSession || !candidateId) return null;
    return (
      activeSession.candidates.find(
        (candidate) => candidate.id === candidateId,
      ) || null
    );
  }, [activeSession, playbackCandidateId]);

  const playerDuration = player?.duration || 0;
  const hasKnownDuration =
    Number.isFinite(playerDuration) && playerDuration > 0;
  const isRemuxPlayback = Boolean(
    currentStream?.behaviorHints?.remuxToMp4 ||
    currentStream?.behaviorHints?.remuxStrategy === "progressive-fmp4" ||
    selectedSessionCandidate?.requiresRemux,
  );
  const isLivePlayback = Boolean(
    !isRemuxPlayback &&
    currentStream?.url?.toLowerCase().includes(".m3u8") &&
    !hasKnownDuration,
  );
  const canSeekPlayback = Boolean(
    !activeCast && !isRemuxPlayback && hasKnownDuration && !isLivePlayback,
  );
  const sourceLabel = useMemo(() => {
    if (!currentStream && activeCast) {
      return t("player.controls.remoteCast", { defaultValue: "Remote cast" });
    }
    if (!currentStream) return undefined;

    const container = selectedSessionCandidate?.container;
    const visibleContainer =
      container && container.toLowerCase() !== "unknown"
        ? container.toUpperCase()
        : undefined;
    const parts = [
      currentStream.resolution || selectedSessionCandidate?.quality,
      visibleContainer,
      currentStream.infoHash
        ? t("player.controls.torrent", { defaultValue: "Torrent" })
        : currentStream.url?.toLowerCase().includes(".m3u8")
          ? "HLS"
          : t("player.controls.direct", { defaultValue: "Direct" }),
      isRemuxPlayback
        ? t("player.controls.remux", { defaultValue: "Remux" })
        : undefined,
    ].filter(Boolean);

    return parts.join(" · ");
  }, [activeCast, currentStream, isRemuxPlayback, selectedSessionCandidate, t]);
  const downloadStatus = useMemo(() => {
    if (!downloadTask) return null;
    if (isTaskOfflinePlayable(downloadTask)) {
      return t("player.controls.downloadReady", {
        defaultValue: "Ready offline",
      });
    }
    if (
      downloadTask.status === "Downloading" ||
      downloadTask.status === "Preparing" ||
      downloadTask.status === "Verifying"
    ) {
      return t("player.controls.downloadActive", {
        defaultValue: "Download active",
      });
    }
    if (downloadTask.status === "Error") {
      return t("player.controls.downloadFailed", {
        defaultValue: "Download failed",
      });
    }
    return null;
  }, [downloadTask, t]);
  const castStatus = activeCast
    ? t("player.controls.castingTo", {
        defaultValue: "Casting to {{name}}",
        name: activeCast.device.name,
      })
    : null;
  const playerCapabilities = useMemo(
    () => ({
      canSeek: canSeekPlayback,
      isLive: isLivePlayback,
      isRemux: isRemuxPlayback,
      canUseVolume: Platform.OS === "web" && !activeCast,
      canUseFullscreen: !activeCast,
      hasCaptions: subtitles.length > 0,
      canCast: Platform.OS === "web" && Boolean(mediaInfo) && !activeCast,
      canRetry: Boolean(playbackSessionId && (runtimeError || fallbackReason)),
    }),
    [
      activeCast,
      canSeekPlayback,
      fallbackReason,
      isLivePlayback,
      isRemuxPlayback,
      mediaInfo,
      playbackSessionId,
      runtimeError,
      subtitles.length,
    ],
  );

  useEffect(() => {
    if (player && player.playbackRate !== playbackRate) {
      player.playbackRate = playbackRate;
    }
  }, [player, playbackRate]);

  useEffect(() => {
    if (!player) return;
    setMuted(Boolean(player.muted));
    setVolume(
      Number.isFinite(player.volume)
        ? Math.min(1, Math.max(0, player.volume))
        : 1,
    );

    const volumeSub = player.addListener?.("volumeChange", ({ volume }: any) =>
      setVolume(Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1),
    );
    const mutedSub = player.addListener?.("mutedChange", ({ muted }: any) =>
      setMuted(Boolean(muted)),
    );

    return () => {
      volumeSub?.remove?.();
      mutedSub?.remove?.();
    };
  }, [player]);

  const handleSeekBy = useCallback(
    (seconds: number) => {
      if (!canSeekPlayback) return;
      player?.seekBy(seconds);
      showControls();
    },
    [canSeekPlayback, player, showControls],
  );

  const handleSeekTo = useCallback(
    (seconds: number) => {
      if (!canSeekPlayback || !player) return;
      player.currentTime = seconds;
      showControls();
    },
    [canSeekPlayback, player, showControls],
  );

  const handleSeekPercent = useCallback(
    (percent: number) => {
      if (!canSeekPlayback || !player || !player.duration) return;
      player.currentTime = (player.duration * percent) / 100;
      showControls();
    },
    [canSeekPlayback, player, showControls],
  );

  const handleToggleMute = useCallback(() => {
    if (!player) return;
    const nextMuted = !player.muted;
    player.muted = nextMuted;
    setMuted(nextMuted);
    showControls();
  }, [player, showControls]);

  const handleVolumeChange = useCallback(
    (nextVolume: number) => {
      if (!player) return;
      const normalized = Math.min(1, Math.max(0, nextVolume));
      player.volume = normalized;
      setVolume(normalized);
      if (normalized > 0 && player.muted) {
        player.muted = false;
        setMuted(false);
      }
      showControls();
    },
    [player, showControls],
  );

  const handleToggleFullscreen = useCallback(() => {
    try {
      if (Platform.OS === "web") {
        const videoElement = document.querySelector("video");
        if (videoElement) {
          if (!document.fullscreenElement) {
            videoElement.requestFullscreen().catch(console.error);
          } else {
            document.exitFullscreen().catch(console.error);
          }
        }
      } else if (videoViewRef.current?.enterFullscreen) {
        videoViewRef.current.enterFullscreen().catch(console.error);
      }
      showControls();
    } catch (e) {
      console.warn("Fullscreen failed", e);
    }
  }, [showControls]);

  const preparationActive = Boolean(
    (planningLaunchId && streamState !== "error") ||
    partialReplanControllerRef.current ||
    (currentStream &&
      !playbackUri &&
      streamState !== "error" &&
      activeSession?.status !== "failed" &&
      activeSession?.status !== "cancelled" &&
      activeSession?.status !== "completed"),
  );
  const handleEscape = useCallback(() => {
    const action = getPlayerEscapeAction({
      settingsOpen,
      castOpen: castModalOpen,
      preparationActive,
    });
    if (action === "closeSettings") {
      setSettingsOpen(false);
      return true;
    }
    if (action === "closeCast") {
      setCastModalOpen(false);
      return true;
    }
    if (action === "cancelPreparation") {
      handleCancelPreparation();
      return true;
    }
    return false;
  }, [castModalOpen, handleCancelPreparation, preparationActive, settingsOpen]);

  usePlayerHotkeys({
    player,
    showControls,
    setSeekFeedback,
    seekFeedbackTimer,
    SEEK_SECONDS,
    canSeek: canSeekPlayback,
    onToggleFullscreen: handleToggleFullscreen,
    onToggleMute: handleToggleMute,
    onSeekBy: handleSeekBy,
    onSeekPercent: handleSeekPercent,
    onEscape: handleEscape,
  });

  const stopCasting = async () => {
    if (!activeCast) return;
    const closeRemoteOnlyPlayer = !currentStream;
    try {
      await stopCastSession(activeCast.device.id, activeCast.sessionId);
    } catch (e) {
      console.error("Failed to stop cast", e);
    } finally {
      clearActiveCast();
      if (closeRemoteOnlyPlayer) {
        goBackOrReplace(router);
      }
    }
  };

  const waitingTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(
    (side: "left" | "right") => {
      const now = Date.now();
      const lastTap = lastTapRef.current;
      if (
        lastTap &&
        now - lastTap.time < DOUBLE_TAP_DELAY &&
        lastTap.side === side
      ) {
        if (waitingTapTimer.current) clearTimeout(waitingTapTimer.current);
        if (!canSeekPlayback) return;
        handleSeekBy(side === "right" ? SEEK_SECONDS : -SEEK_SECONDS);
        setSeekFeedback(side);
        if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
        seekFeedbackTimer.current = setTimeout(
          () => setSeekFeedback(null),
          600,
        );
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { time: now, side };
        if (waitingTapTimer.current) clearTimeout(waitingTapTimer.current);
        waitingTapTimer.current = setTimeout(() => {
          toggleControls();
          lastTapRef.current = null;
        }, DOUBLE_TAP_DELAY);
      }
    },
    [canSeekPlayback, handleSeekBy, toggleControls],
  );

  const handleTogglePiP = useCallback(() => {
    try {
      if (Platform.OS === "web") {
        const videoElement = document.querySelector("video");
        if (
          videoElement &&
          (videoElement as any).requestPictureInPicture &&
          videoElement.readyState >= 1
        ) {
          (videoElement as any).requestPictureInPicture().catch(console.error);
        }
      } else {
        videoViewRef.current?.startPictureInPicture?.() ||
          videoViewRef.current?.enterPictureInPicture?.();
      }
    } catch (e) {
      console.warn("PiP failed", e);
    }
  }, []);

  const isPiPSupported = useMemo(() => {
    if (Platform.OS === "web") {
      return Boolean(
        typeof document !== "undefined" &&
        ((document as any).pictureInPictureEnabled ||
          (document.createElement("video") as any)
            .webkitSupportsPresentationMode),
      );
    }
    try {
      return isPictureInPictureSupported();
    } catch {
      return false;
    }
  }, []);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (currentStream && !playbackUri && !previewControls) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="light" />
        <PlayerStatusOverlay
          streamState={streamState}
          runtimeState={runtimeState}
          streamMetrics={streamMetrics}
          isBuffering={isBuffering}
          errorMessage={errorMessage}
          runtimeError={runtimeError}
          fallbackReason={fallbackReason}
          session={activeSession}
          onBack={handleClose}
          onRetry={handleRetryPlayback}
          onCancelPreparation={
            preparationActive ? handleCancelPreparation : undefined
          }
          onChooseSource={mediaInfo ? handleChooseSource : undefined}
          onPreviewPlayer={__DEV__ ? () => setPreviewControls(true) : undefined}
          onOpenSourcesDevices={
            currentStream.infoHash || shouldOfferSourcesDevicesRecovery
              ? handleOpenSourcesDevices
              : undefined
          }
        />
      </View>
    );
  }

  if (!currentStream && !activeCast && planningLaunchId) {
    return (
      <View style={styles.errorContainer} testID="player-planning-screen">
        <StatusBar style="light" />
        <PlayerStatusOverlay
          streamState={streamState}
          runtimeState={runtimeState}
          streamMetrics={streamMetrics}
          isBuffering={isBuffering}
          errorMessage={errorMessage}
          runtimeError={runtimeError}
          fallbackReason={fallbackReason}
          session={activeSession}
          onBack={handleClose}
          onRetry={handleRetryPlayback}
          onCancelPreparation={
            preparationActive ? handleCancelPreparation : undefined
          }
          onChooseSource={mediaInfo ? handleChooseSource : undefined}
          onOpenSourcesDevices={
            shouldOfferSourcesDevicesRecovery
              ? handleOpenSourcesDevices
              : undefined
          }
        />
      </View>
    );
  }

  if (!currentStream && !activeCast) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="light" />
        <PlaybackStatusPanel
          tone="warning"
          statusLabel={t("player.errors.noStreamStatus")}
          title={t("player.errors.noStreamTitle")}
          message={t("player.errors.noStream")}
          actions={[
            {
              label: t("player.errors.browseTitles"),
              onPress: handleBrowseTitles,
              variant: "primary",
              icon: "search-outline",
            },
            {
              label: t("player.errors.goBack"),
              onPress: handleClose,
              variant: "secondary",
              icon: "chevron-back",
            },
          ]}
        />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View testID="player-screen" style={styles.container}>
        <StatusBar hidden />
        <View style={styles.videoContainer}>
          {activeCast ? (
            <View style={styles.castContainer}>
              {activeCast.mediaInfo.poster && (
                <Image
                  source={{ uri: activeCast.mediaInfo.poster }}
                  style={styles.castBg}
                  blurRadius={20}
                />
              )}
              <View style={styles.castCard}>
                <View style={styles.castIconWrap}>
                  <Ionicons name="tv-outline" size={64} color={colors.tint} />
                </View>
                <Text style={styles.castTitle}>
                  {t("player.casting.active")}
                </Text>
                <Text style={styles.castSubtitle}>
                  {t("player.casting.to", { name: activeCast.device.name })}
                </Text>
                <Pressable
                  style={styles.stopCastBtn}
                  onPress={stopCasting}
                  accessibilityRole="button"
                  accessibilityLabel={t("player.casting.stop")}
                >
                  <Ionicons name="stop-circle" size={24} color={colors.error} />
                  <Text style={styles.stopCastText}>
                    {t("player.casting.stop")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {previewControls ? (
                <View style={styles.webVideo} />
              ) : (
                <VideoView
                  ref={videoViewRef}
                  player={player}
                  style={styles.webVideo}
                  nativeControls={false}
                  contentFit="contain"
                  allowsPictureInPicture={isPiPSupported}
                  startsPictureInPictureAutomatically={false}
                  onFullscreenEnter={() => showControls()}
                />
              )}

              <PlayerInteractionLayer
                onTapSide={handleTap}
                onToggleControls={toggleControls}
              />
            </>
          )}

          {seekFeedback && (
            <View
              style={[
                styles.seekOverlay,
                { [seekFeedback === "left" ? "left" : "right"]: "15%" },
              ]}
            >
              <Text style={styles.seekText}>
                {seekFeedback === "left" ? "<<" : ">>"} {SEEK_SECONDS}s
              </Text>
            </View>
          )}

          <PlayerStatusOverlay
            streamState={previewControls ? "playing" : streamState}
            runtimeState={runtimeState}
            streamMetrics={streamMetrics}
            isBuffering={previewControls ? false : isBuffering}
            errorMessage={previewControls ? null : errorMessage}
            runtimeError={previewControls ? null : runtimeError}
            fallbackReason={previewControls ? null : fallbackReason}
            session={previewControls ? null : activeSession}
            onBack={handleClose}
            onRetry={handleRetryPlayback}
            onCancelPreparation={
              preparationActive ? handleCancelPreparation : undefined
            }
            onChooseSource={mediaInfo ? handleChooseSource : undefined}
            onPreviewPlayer={
              __DEV__ && !previewControls
                ? () => setPreviewControls(true)
                : undefined
            }
            onOpenSourcesDevices={
              currentStream?.infoHash || shouldOfferSourcesDevicesRecovery
                ? handleOpenSourcesDevices
                : undefined
            }
          />

          {controlsVisible && !activeCast && currentStream && (
            <PlayerOverlay
              currentStream={currentStream}
              engineType={engine?.getEngineType() ?? "Unknown"}
              stats={stats}
              onClose={handleClose}
              onWebCast={() => setCastModalOpen(true)}
              onTogglePiP={handleTogglePiP}
              isPiPSupported={isPiPSupported}
              showInfoBar={false}
            />
          )}

          <PlayerControls
            player={player}
            currentTime={player?.currentTime || 0}
            duration={playerDuration}
            isVisible={controlsVisible && !activeCast}
            isPlaying={player?.playing ?? false}
            capabilities={
              previewControls
                ? { ...playerCapabilities, canRetry: false, canCast: false }
                : playerCapabilities
            }
            sourceLabel={sourceLabel}
            castStatus={castStatus}
            downloadStatus={downloadStatus}
            fallbackReason={previewControls ? null : fallbackReason}
            audioStatus={
              audioTracks.find((track) => track.active)?.label || null
            }
            subtitleStatus={
              subtitles.find((track) => track.active)?.label ||
              (subtitles.length > 0
                ? t("player.settings.off", { defaultValue: "Subtitles off" })
                : null)
            }
            muted={muted}
            volume={volume}
            onSeekBy={handleSeekBy}
            onSeekTo={handleSeekTo}
            onToggleMute={handleToggleMute}
            onVolumeChange={handleVolumeChange}
            onToggleFullscreen={handleToggleFullscreen}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenCast={() => setCastModalOpen(true)}
            onRetry={handleRetryPlayback}
            onPlayPause={() => {
              if (previewControls) return;
              if (player?.playing) player.pause();
              else player?.play();
            }}
          />
        </View>

        {showResumePrompt && (
          <ResumePrompt
            onResponse={handleResumeResponse}
            title={mediaInfo?.title || ""}
            resumeTimeSeconds={resumePromptTimeSeconds}
          />
        )}

        {showNextEpisodeOverlay && nextEpisode && (
          <NextEpisodeOverlay
            isVisible={showNextEpisodeOverlay}
            nextEpisode={{
              title: nextEpisode.title,
              season: nextEpisode.season,
              episode: nextEpisode.episode,
            }}
            onWatchedNow={handleNextEpisode}
            onCancel={() => setShowNextEpisodeOverlay(false)}
          />
        )}

        {settingsOpen && (
          <PlayerSettingsModal
            visible={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            audioTracks={audioTracks}
            subtitles={subtitles}
            onSelectAudio={(id: string | null) => {
              if (id && player?.availableAudioTracks?.length) {
                const track = findPlayerTrackByRowId(
                  player.availableAudioTracks,
                  id,
                );
                if (track) player.audioTrack = track;
              } else if (id) {
                engine?.setAudioTrack(id);
              }
              refreshPlayerTracks();
            }}
            onSelectSubtitle={(id: string | null) => {
              if (player?.availableSubtitleTracks?.length) {
                player.subtitleTrack = id
                  ? findPlayerTrackByRowId(player.availableSubtitleTracks, id)
                  : null;
              } else {
                engine?.setSubtitle(id);
              }
              refreshPlayerTracks();
            }}
            playbackRate={playbackRate}
            onSelectPlaybackRate={setPlaybackRate}
          />
        )}

        {castModalOpen && (
          <DesktopCastModal
            visible={castModalOpen}
            onClose={() => setCastModalOpen(false)}
            orchestratorInput={
              mediaInfo
                ? {
                    type: mediaInfo.type,
                    id: mediaInfo.itemId,
                    title: mediaInfo.title,
                    poster: mediaInfo.poster,
                    season: mediaInfo.season,
                    episode: mediaInfo.episode,
                  }
                : undefined
            }
            playbackUri={playbackUri || ""}
            title={mediaInfo?.title || ""}
            onOpenSourcesDevices={() => {
              setCastModalOpen(false);
              router.push("/settings/sources" as any);
            }}
            onCastStart={(device, details) => {
              if (player?.playing) player.pause();
              setActiveCast({
                device,
                mediaInfo: details.source?.mediaInfo ||
                  mediaInfo || {
                    type: "movie",
                    itemId: "unknown",
                    title: "Streamer",
                  },
                sessionId: details.sessionId,
              });
              setCastModalOpen(false);
            }}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    errorContainer: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    videoContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#000",
      overflow: "hidden",
    },
    webVideo: { width: "100%", height: "100%", backgroundColor: "#000" },
    seekOverlay: {
      position: "absolute",
      top: "40%",
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.surfaceOverlay,
      borderRadius: 24,
      zIndex: 20,
    },
    seekText: { color: colors.text, fontSize: 16, fontWeight: "bold" },
    castContainer: {
      flex: 1,
      width: "100%",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    castBg: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      opacity: isDark ? 0.3 : 0.1,
    },
    castCard: {
      alignItems: "center",
      backgroundColor: colors.surfaceOverlay,
      padding: 40,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: colors.border,
    },
    castIconWrap: {
      backgroundColor: colors.tint + "15",
      padding: 24,
      borderRadius: 40,
      marginBottom: 24,
    },
    castTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 8,
    },
    castSubtitle: {
      color: colors.textSecondary,
      fontSize: 16,
      marginBottom: 32,
      textAlign: "center",
      maxWidth: 300,
    },
    stopCastBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.error + "15",
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: colors.error + "30",
    },
    stopCastText: { color: colors.error, fontWeight: "600", fontSize: 15 },
  });
