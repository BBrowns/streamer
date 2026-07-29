import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useReducer,
} from "react";
import { AppState, View, Text, Pressable, Platform, Image } from "react-native";
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
import { usePlayerMediaControls } from "../hooks/usePlayerMediaControls";

// UI Components
import { PlayerOverlay } from "../components/player/PlayerOverlay";
import { PlayerSettingsModal } from "../components/player/PlayerSettingsModal";
import { PlayerStatusOverlay } from "../components/player/PlayerStatusOverlay";
import { PlayerControls } from "../components/player/PlayerControls";
import { replaceWithSeekableSource } from "../components/player/seekablePlaybackHandoff";
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
  buildPlayerTrackCatalog,
  findPreferredPlayerTrack,
  normalizeTrackLanguage,
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
import {
  PLAYBACK_SEEK_GRACE_PERIOD_MS,
  PLAYBACK_STALL_CHECK_INTERVAL_MS,
  hasPlaybackProgressed,
  shouldAdvanceAfterPlaybackStall,
} from "../components/player/playbackStallWatchdog";
import { ExpoMediaPlayerAdapter } from "../services/playback/MediaPlayerAdapter";
import {
  initialPlaybackRuntimeViewState,
  reducePlaybackRuntimeViewState,
} from "../services/playback/PlaybackRuntimeCoordinator";
import { ExternalSubtitleRenderer } from "../components/player/ExternalSubtitleRenderer";
import {
  parseSubtitleDocument,
  type SubtitleCue,
} from "../services/playback/SubtitleParser";
import {
  getAddonSubtitles,
  loadAddonSubtitleDocument,
  mergeSubtitleTracks,
} from "../services/playback/AddonSubtitleService";
import type { SubtitleTrack } from "../services/streamEngine/IStreamEngine";
import {
  captureFallbackContinuity,
  resolveFallbackResumePosition,
  type FallbackContinuitySnapshot,
} from "../services/playback/FallbackContinuity";
import {
  buildPlaybackDiagnostics,
  PlaybackDiagnosticsRecorder,
  type PlaybackDiagnosticEvent,
} from "../services/playback/PlaybackDiagnostics";
import { getActivePlaybackSegment } from "../services/playback/PlaybackSegmentsProvider";
import { createPlayerScreenStyles } from "../components/player/playerScreenStyles";

const DOUBLE_TAP_DELAY = 300;
const SEEK_SECONDS = 10;
const PLAYBACK_START_TIMEOUT_MS = 60_000;
const SEEKABLE_CACHE_POLL_INTERVAL_MS = 2_000;

type SeekableCacheStatus =
  | "not_started"
  | "evaluating"
  | "preparing"
  | "ready"
  | "unavailable";

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

function getPlayerVisibility() {
  if (AppState.currentState !== "active") return false;
  if (Platform.OS !== "web" || typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

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
  const acceptedCurrentTime = usePlayerStore((s) => s.currentTime);
  const preferredAudioLang = usePlayerStore((s) => s.preferredAudioLang);
  const preferredSubtitleLang = usePlayerStore((s) => s.preferredSubtitleLang);
  const subtitleMode = usePlayerStore((s) => s.subtitleMode);
  const subtitleAccessibility = usePlayerStore((s) => s.subtitleAccessibility);
  const subtitleTextSize = usePlayerStore((s) => s.subtitleTextSize);
  const subtitleBackground = usePlayerStore((s) => s.subtitleBackground);
  const subtitleBackgroundOpacity = usePlayerStore(
    (s) => s.subtitleBackgroundOpacity,
  );
  const subtitleVerticalPosition = usePlayerStore(
    (s) => s.subtitleVerticalPosition,
  );
  const subtitleFontFamily = usePlayerStore((s) => s.subtitleFontFamily);
  const subtitleSyncOffsetSeconds = usePlayerStore(
    (s) => s.subtitleSyncOffsetSeconds,
  );
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setSubtitleMode = usePlayerStore((s) => s.setSubtitleMode);
  const setSubtitleAccessibility = usePlayerStore(
    (s) => s.setSubtitleAccessibility,
  );
  const setSubtitleTextSize = usePlayerStore((s) => s.setSubtitleTextSize);
  const setSubtitleBackground = usePlayerStore((s) => s.setSubtitleBackground);
  const setSubtitleBackgroundOpacity = usePlayerStore(
    (s) => s.setSubtitleBackgroundOpacity,
  );
  const setSubtitleVerticalPosition = usePlayerStore(
    (s) => s.setSubtitleVerticalPosition,
  );
  const setSubtitleFontFamily = usePlayerStore((s) => s.setSubtitleFontFamily);
  const resetSubtitleStyle = usePlayerStore((s) => s.resetSubtitleStyle);
  const setSubtitleSyncOffsetSeconds = usePlayerStore(
    (s) => s.setSubtitleSyncOffsetSeconds,
  );
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
  const activeGatewayJobId = activeSession?.gatewayJobId;
  const playbackSessionCreatedAt = activeSession?.createdAt;
  const playbackSessionTimeoutBudgetMs = activeSession?.timeoutBudgetMs;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [previewControls, setPreviewControls] = useState(false);
  const [fallbackStatusMessage, setFallbackStatusMessage] = useState<
    string | null
  >(null);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [seekableCacheStatus, setSeekableCacheStatus] =
    useState<SeekableCacheStatus>("not_started");
  const [seekableHandoffApplied, setSeekableHandoffApplied] = useState(false);
  const [trackCatalogRevision, setTrackCatalogRevision] = useState(0);
  const [externalSubtitleCues, setExternalSubtitleCues] = useState<
    SubtitleCue[]
  >([]);
  const [addonSubtitles, setAddonSubtitles] = useState<SubtitleTrack[]>([]);
  const [subtitleLoadState, setSubtitleLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [diagnosticsRevision, setDiagnosticsRevision] = useState(0);
  const [runtimeViewState, dispatchRuntimeViewEvent] = useReducer(
    reducePlaybackRuntimeViewState,
    initialPlaybackRuntimeViewState,
  );
  const visibleFallbackReason = fallbackReason || fallbackStatusMessage;

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
  const fallbackAttemptRef = useRef(0);
  const pendingFallbackRestoreRef = useRef<FallbackContinuitySnapshot | null>(
    null,
  );
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
  const activeCastRef = useRef(activeCast);
  const previewControlsRef = useRef(previewControls);
  const playerVisibleRef = useRef(getPlayerVisibility());
  const playbackStartedRef = useRef(false);
  const lastPlaybackProgressAtRef = useRef(Date.now());
  const lastPlaybackProgressRef = useRef({
    currentTime: undefined as number | undefined,
    bufferedPosition: undefined as number | undefined,
  });
  const seekingUntilRef = useRef(0);
  const stallFallbackTriggeredRef = useRef(false);
  const seekableHandoffControllerRef = useRef<AbortController | null>(null);
  const subtitleDocumentControllerRef = useRef<AbortController | null>(null);
  const seekableHandoffInFlightRef = useRef(false);
  const seekableHandoffShouldResumeRef = useRef<boolean | null>(null);
  const pausedAfterSeekableHandoffRef = useRef(false);
  const playbackDiagnosticsRecorderRef = useRef(
    new PlaybackDiagnosticsRecorder(),
  );
  const planObservedKeyRef = useRef<string | null>(null);

  const recordDiagnostic = useCallback((event: PlaybackDiagnosticEvent) => {
    playbackDiagnosticsRecorderRef.current.record(event);
    setDiagnosticsRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    playbackDiagnosticsRecorderRef.current = new PlaybackDiagnosticsRecorder();
    planObservedKeyRef.current = null;
    setDiagnosticsRevision((revision) => revision + 1);
  }, [
    mediaInfo?.episode,
    mediaInfo?.itemId,
    mediaInfo?.season,
    mediaInfo?.type,
  ]);

  useEffect(() => {
    activePlanningLaunchIdRef.current = planningLaunchId;
  }, [planningLaunchId]);

  useEffect(() => {
    activePlaybackSessionIdRef.current = playbackSessionId;
  }, [playbackSessionId]);

  useEffect(() => {
    if (!currentStream || !playbackSessionId || !playbackSessionCreatedAt) {
      return;
    }
    if (planObservedKeyRef.current === playbackSessionId) return;
    const createdAt = Date.parse(playbackSessionCreatedAt);
    if (!Number.isFinite(createdAt)) return;
    planObservedKeyRef.current = playbackSessionId;
    recordDiagnostic({
      type: "plan_usable",
      elapsedMs: Date.now() - createdAt,
    });
  }, [
    currentStream,
    playbackSessionCreatedAt,
    playbackSessionId,
    recordDiagnostic,
  ]);

  useEffect(() => {
    activeCastRef.current = activeCast;
  }, [activeCast]);

  useEffect(() => {
    previewControlsRef.current = previewControls;
  }, [previewControls]);

  useEffect(() => {
    const syncVisibility = () => {
      const wasVisible = playerVisibleRef.current;
      const isVisible = getPlayerVisibility();
      playerVisibleRef.current = isVisible;

      // Time spent in the background is not a playback stall. Start a fresh
      // bounded observation window when the viewer returns to the player.
      if (!wasVisible && isVisible && playbackStartedRef.current) {
        lastPlaybackProgressAtRef.current = Date.now();
      }
    };

    syncVisibility();
    const appStateSubscription = AppState.addEventListener(
      "change",
      syncVisibility,
    );
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", syncVisibility);
    }

    return () => {
      appStateSubscription.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", syncVisibility);
      }
    };
  }, []);

  const markIntentionalSeek = useCallback(() => {
    const now = Date.now();
    seekingUntilRef.current = now + PLAYBACK_SEEK_GRACE_PERIOD_MS;
    lastPlaybackProgressAtRef.current = now;
  }, []);

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
      seekableHandoffControllerRef.current?.abort();
      seekableHandoffControllerRef.current = null;
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
    seekableHandoffControllerRef.current?.abort();
    seekableHandoffControllerRef.current = null;
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
    seekableHandoffControllerRef.current?.abort();
    seekableHandoffControllerRef.current = null;
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
      seekableHandoffControllerRef.current?.abort();
      seekableHandoffControllerRef.current = null;
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
    setFallbackStatusMessage(null);
    partialReplanControllerRef.current?.abort();
    partialReplanControllerRef.current = null;
    seekableHandoffControllerRef.current?.abort();
    seekableHandoffControllerRef.current = null;
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
    setFallbackStatusMessage,
    setRuntimeFailure,
    setSessionStream,
    setStreamStatus,
  ]);

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

      // The current player can still receive a late cache-ready response
      // after a fallback has selected another candidate. Stop that monitor
      // before changing the session-owned source.
      seekableHandoffControllerRef.current?.abort();
      seekableHandoffControllerRef.current = null;

      const fallbackStatus =
        reason ||
        t("player.status.tryingFallback", {
          defaultValue: "Trying another source...",
        });
      setFallbackStatusMessage(fallbackStatus);
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

        setPlaybackUri(null);
        setResolveAttempt((attempt) => attempt + 1);
        fallbackAdvanced = true;
        return true;
      } finally {
        if (!fallbackAdvanced) pendingFallbackRestoreRef.current = null;
        fallbackInFlightRef.current = false;
      }
    },
    [
      advanceToNextFallback,
      mediaInfo,
      playbackAttemptId,
      playbackCandidateId,
      playbackSessionId,
      playbackUri,
      recordDiagnostic,
      setBuffering,
      setFallbackStatusMessage,
      setPlaying,
      setRuntimeFailure,
      setRuntimeState,
      setSessionStream,
      setStreamStatus,
      t,
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
  const mediaAdapter = useMemo(
    () =>
      new ExpoMediaPlayerAdapter(
        player,
        Platform.OS === "ios"
          ? "ios"
          : Platform.OS === "android"
            ? "android"
            : "web",
      ),
    [player],
  );

  const handleFirstFrameRendered = useCallback(() => {
    dispatchRuntimeViewEvent({ type: "first_frame_rendered" });
    const createdAt = playbackSessionCreatedAt
      ? Date.parse(playbackSessionCreatedAt)
      : Number.NaN;
    if (!playbackStartedRef.current && Number.isFinite(createdAt)) {
      const elapsedMs = Date.now() - createdAt;
      recordDiagnostic({
        type: "first_frame",
        elapsedMs,
      });
      const timeToUsablePlanMs =
        playbackDiagnosticsRecorderRef.current.snapshot().timeToUsablePlanMs ??
        0;
      recordDiagnostic({
        type: "initial_buffering",
        durationMs: Math.max(0, elapsedMs - timeToUsablePlanMs),
      });
    }
    if (fallbackInFlightRef.current) return;

    if (!playbackStartedRef.current) {
      playbackStartedRef.current = true;
      setHasPlaybackStarted(true);
      lastPlaybackProgressAtRef.current = Date.now();
    }
    if (playbackSessionId) {
      markPlaybackSessionPlaying(playbackSessionId);
    }
    setBuffering(false);
    setPlaying(Boolean(player.playing));
    setStreamStatus("playing");
    setFallbackStatusMessage(null);
  }, [
    playbackSessionId,
    playbackSessionCreatedAt,
    player,
    recordDiagnostic,
    setBuffering,
    setPlaying,
    setStreamStatus,
  ]);

  useEffect(() => {
    if (!player || !playbackUri || !currentStream) return;

    dispatchRuntimeViewEvent({ type: "media_loading" });
    player.timeUpdateEventInterval = 1;
    playbackStartedRef.current = false;
    setHasPlaybackStarted(false);
    setSeekableCacheStatus("not_started");
    setSeekableHandoffApplied(false);
    seekableHandoffInFlightRef.current = false;
    seekableHandoffShouldResumeRef.current = null;
    pausedAfterSeekableHandoffRef.current = false;
    lastPlaybackProgressAtRef.current = Date.now();
    lastPlaybackProgressRef.current = {
      currentTime: undefined,
      bufferedPosition: undefined,
    };
    seekingUntilRef.current = 0;
    stallFallbackTriggeredRef.current = false;
    setBuffering(true);

    const markLoading = () => {
      dispatchRuntimeViewEvent({ type: "media_loading" });
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
      // A stale video event can arrive after we have selected the next
      // candidate. Preserve the visible fallback state until that candidate
      // actually owns a player again.
      if (fallbackInFlightRef.current) return;
      // `replaceAsync` can emit ready/loaded events even when the viewer had
      // paused before the seekable-cache handoff. Those events describe media
      // readiness, not an explicit request to resume.
      if (
        pausedAfterSeekableHandoffRef.current ||
        (seekableHandoffInFlightRef.current &&
          seekableHandoffShouldResumeRef.current === false)
      ) {
        setBuffering(false);
        setPlaying(false);
        return;
      }
      if (playbackSessionId) {
        markPlaybackSessionPlaying(playbackSessionId);
      }
      setBuffering(false);
      setPlaying(true);
      setStreamStatus("playing");
      setFallbackStatusMessage(null);
    };

    const markPlaybackStarted = () => {
      if (!playbackStartedRef.current) {
        playbackStartedRef.current = true;
        setHasPlaybackStarted(true);
        lastPlaybackProgressAtRef.current = Date.now();
      }
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
          dispatchRuntimeViewEvent({
            type: "media_ready",
            shouldPlay:
              Boolean(player.playing) &&
              !pausedAfterSeekableHandoffRef.current &&
              seekableHandoffShouldResumeRef.current !== false,
          });
          setBuffering(true);
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
        dispatchRuntimeViewEvent({
          type: "playing_changed",
          isPlaying: Boolean(isPlaying),
        });
        if (isPlaying) {
          if (
            seekableHandoffInFlightRef.current &&
            seekableHandoffShouldResumeRef.current === false
          ) {
            return;
          }
          // A real play event after a paused handoff is the user's explicit
          // resume intent, so subsequent media-ready events may be playing.
          pausedAfterSeekableHandoffRef.current = false;
          if (playbackStartedRef.current) markPlaying();
        }
      },
    );

    const timeSub = player.addListener("timeUpdate", ({ currentTime }: any) => {
      const nextProgress = {
        currentTime:
          typeof currentTime === "number" && Number.isFinite(currentTime)
            ? currentTime
            : undefined,
        bufferedPosition:
          typeof player.bufferedPosition === "number" &&
          Number.isFinite(player.bufferedPosition)
            ? player.bufferedPosition
            : undefined,
      };
      if (
        hasPlaybackProgressed(lastPlaybackProgressRef.current, nextProgress)
      ) {
        lastPlaybackProgressAtRef.current = Date.now();
      }
      lastPlaybackProgressRef.current = nextProgress;

      if (nextProgress.currentTime && nextProgress.currentTime > 0) {
        markPlaybackStarted();
        dispatchRuntimeViewEvent({ type: "first_frame_rendered" });
      }
      if (nextProgress.currentTime || nextProgress.bufferedPosition) {
        markPlaying();
      }
    });

    const sourceSub = player.addListener("sourceLoad", () => {
      if (player.status === "readyToPlay") {
        dispatchRuntimeViewEvent({
          type: "media_ready",
          shouldPlay:
            Boolean(player.playing) &&
            !pausedAfterSeekableHandoffRef.current &&
            seekableHandoffShouldResumeRef.current !== false,
        });
      }
    });

    const remainingSessionBudgetMs = playbackSessionCreatedAt
      ? Math.max(
          0,
          Date.parse(playbackSessionCreatedAt) +
            (playbackSessionTimeoutBudgetMs ?? PLAYBACK_START_TIMEOUT_MS) -
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

    const stallWatchdog = setInterval(() => {
      const state = usePlayerStore.getState();
      const now = Date.now();
      if (
        state.currentStream !== currentStream ||
        state.streamState === "error" ||
        previewControlsRef.current
      ) {
        return;
      }
      if (
        !shouldAdvanceAfterPlaybackStall({
          now,
          lastProgressAt: lastPlaybackProgressAtRef.current,
          hasStarted: playbackStartedRef.current,
          // `playing` is the player's desired playback state. It remains true
          // while a stream is buffering, but becomes false for an explicit
          // pause, which is precisely the distinction needed here.
          isPlaying: Boolean(player.playing),
          isVisible: playerVisibleRef.current,
          isSeeking: now < seekingUntilRef.current,
          isCasting: Boolean(activeCastRef.current),
          fallbackInFlight:
            fallbackInFlightRef.current || seekableHandoffInFlightRef.current,
          fallbackAlreadyTriggered: stallFallbackTriggeredRef.current,
        })
      ) {
        return;
      }

      stallFallbackTriggeredRef.current = true;
      recordDiagnostic({
        type: "stall",
        durationMs: now - lastPlaybackProgressAtRef.current,
      });
      const fallbackMessage = t("player.status.playbackStalledTryingFallback", {
        defaultValue:
          "Playback stopped making progress. Trying another source.",
      });
      const timeoutError = createPlaybackRuntimeError(
        "PLAYBACK_TIMEOUT",
        t("player.errors.playbackStalled", {
          defaultValue:
            "Playback stopped making progress. Try another source or retry.",
        }),
        { retryable: true, shouldFallback: false },
      );
      void tryAdvanceToFallback(timeoutError, fallbackMessage).then(
        (advanced) => {
          if (advanced) return;
          setBuffering(false);
          setPlaying(false);
          setRuntimeFailure(timeoutError);
        },
      );
    }, PLAYBACK_STALL_CHECK_INTERVAL_MS);

    return () => {
      statusSub.remove();
      playingSub.remove();
      timeSub.remove();
      sourceSub.remove();
      clearTimeout(watchdog);
      clearInterval(stallWatchdog);
    };
  }, [
    currentStream,
    playbackUri,
    playbackSessionId,
    playbackSessionCreatedAt,
    playbackSessionTimeoutBudgetMs,
    player,
    recordDiagnostic,
    setBuffering,
    setFallbackStatusMessage,
    setPlaying,
    setRuntimeState,
    setStreamStatus,
    setRuntimeFailure,
    t,
    tryAdvanceToFallback,
  ]);

  const handlePlaybackCompleted = useCallback(() => {
    dispatchRuntimeViewEvent({ type: "completed" });
    setBuffering(false);
    setPlaying(false);
  }, [setBuffering, setPlaying]);

  const {
    audioTracks,
    subtitles: engineSubtitles,
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
    playbackSegments,
    recordExplicitSeek,
    beginProgressSourceReplacement,
    completeProgressSourceReplacement,
    originalLanguage,
  } = usePlayerController({
    player,
    playbackUri,
    onClose: handleClose,
    showControls,
    isProgressiveRemux:
      currentStream?.behaviorHints?.remuxStrategy === "progressive-fmp4",
    hasSeekableHandoff: seekableHandoffApplied,
    onCompleted: handlePlaybackCompleted,
    onDiagnosticEvent: recordDiagnostic,
  });

  useEffect(() => {
    const pending = pendingFallbackRestoreRef.current;
    if (!pending || !player || !playbackUri) return;
    const sourceKey = `${playbackCandidateId || "legacy"}:${playbackUri}`;
    if (sourceKey === pending.sourceUri) return;

    let restored = false;
    const restore = (status: string | undefined = player.status) => {
      if (restored || status !== "readyToPlay") return;
      restored = true;
      const resumeAt = resolveFallbackResumePosition(
        pending,
        mediaAdapter.snapshot().duration,
      );
      recordExplicitSeek(resumeAt);
      mediaAdapter.commitSeek(resumeAt);
      dispatchRuntimeViewEvent({ type: "fallback_media_ready" });
      if (pending.shouldPlay) {
        mediaAdapter.play();
      } else {
        mediaAdapter.pause();
      }
      pendingFallbackRestoreRef.current = null;
    };
    const statusSubscription = player.addListener?.(
      "statusChange",
      ({ status }: { status?: string }) => restore(status),
    );
    restore();
    return () => statusSubscription?.remove?.();
  }, [
    mediaAdapter,
    playbackCandidateId,
    playbackUri,
    player,
    recordExplicitSeek,
  ]);

  const subtitles = useMemo(
    () => mergeSubtitleTracks([...engineSubtitles, ...addonSubtitles]),
    [addonSubtitles, engineSubtitles],
  );

  useEffect(() => {
    setAddonSubtitles([]);
    if (!mediaInfo) return;

    const controller = new AbortController();
    const startedAt = Date.now();
    void getAddonSubtitles(mediaInfo, controller.signal)
      .then((tracks) => {
        if (!controller.signal.aborted) {
          recordDiagnostic({
            type: "subtitle_provider",
            outcome: "succeeded",
            latencyMs: Date.now() - startedAt,
          });
          setAddonSubtitles(tracks);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          recordDiagnostic({
            type: "subtitle_provider",
            outcome: "failed",
            latencyMs: Date.now() - startedAt,
          });
          setAddonSubtitles([]);
        }
      });
    return () => controller.abort();
  }, [
    mediaInfo?.episode,
    mediaInfo?.itemId,
    mediaInfo?.season,
    mediaInfo?.type,
    recordDiagnostic,
  ]);

  const refreshPlayerTracks = useCallback(() => {
    if (!player) {
      setAudioTracks([]);
      setSubtitles(engine?.getSubtitles() || []);
      return;
    }

    const availableAudioTracks = player.availableAudioTracks || [];
    const availableSubtitleTracks = player.availableSubtitleTracks || [];
    const catalog = buildPlayerTrackCatalog({
      availableAudioTracks,
      activeAudioTrack: player.audioTrack,
      availableSubtitleTracks,
      activeSubtitleTrack: player.subtitleTrack,
      engineSubtitles: engine?.getSubtitles() || [],
    });
    setAudioTracks(catalog.audioTracks);
    setSubtitles(catalog.subtitles);
  }, [engine, player, setAudioTracks, setSubtitles]);

  const handleSubtitleSelection = useCallback(
    async (id: string | null) => {
      subtitleDocumentControllerRef.current?.abort();
      subtitleDocumentControllerRef.current = null;
      setExternalSubtitleCues([]);
      setSubtitleLoadState("idle");
      const addonTrack = id
        ? addonSubtitles.find((track) => track.id === id)
        : undefined;

      if (mediaAdapter.selectSubtitleTrack(id)) {
        engine?.setSubtitle(null);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: false })),
        );
        refreshPlayerTracks();
        return;
      }

      if (!id) {
        engine?.setSubtitle(null);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: false })),
        );
        refreshPlayerTracks();
        return;
      }
      mediaAdapter.selectSubtitleTrack(null);
      if (addonTrack) {
        engine?.setSubtitle(null);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: track.id === id })),
        );
      } else {
        engine?.setSubtitle(id);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: false })),
        );
      }
      if (!addonTrack && !engine?.loadSubtitleDocument) {
        refreshPlayerTracks();
        return;
      }

      const controller = new AbortController();
      subtitleDocumentControllerRef.current = controller;
      setSubtitleLoadState("loading");
      try {
        const document = addonTrack
          ? await loadAddonSubtitleDocument(addonTrack, controller.signal)
          : await engine!.loadSubtitleDocument!(id, controller.signal);
        if (controller.signal.aborted) return;
        const cues = parseSubtitleDocument(
          document,
          addonTrack?.format || "vtt",
        );
        if (cues.length === 0) {
          throw new Error("Subtitle document contains no usable cues");
        }
        recordDiagnostic({
          type: "subtitle_parse",
          outcome: "succeeded",
          cueCount: cues.length,
        });
        setExternalSubtitleCues(cues);
        setSubtitleLoadState("ready");
      } catch {
        if (controller.signal.aborted) return;
        recordDiagnostic({
          type: "subtitle_parse",
          outcome: "failed",
        });
        engine?.setSubtitle(null);
        setAddonSubtitles((tracks) =>
          tracks.map((track) => ({ ...track, active: false })),
        );
        setExternalSubtitleCues([]);
        setSubtitleLoadState("error");
      } finally {
        if (subtitleDocumentControllerRef.current === controller) {
          subtitleDocumentControllerRef.current = null;
        }
        refreshPlayerTracks();
      }
    },
    [
      addonSubtitles,
      engine,
      mediaAdapter,
      recordDiagnostic,
      refreshPlayerTracks,
    ],
  );

  useEffect(() => {
    return () => {
      subtitleDocumentControllerRef.current?.abort();
      subtitleDocumentControllerRef.current = null;
      setExternalSubtitleCues([]);
      setSubtitleLoadState("idle");
    };
  }, [engine, playbackUri]);

  useEffect(() => {
    appliedTrackPreferencesRef.current = null;
    setAudioTracks([]);
    setSubtitles(engine?.getSubtitles() || []);

    if (!engine) return;
    const controller = new AbortController();
    const handleEngineTracks = () => refreshPlayerTracks();
    engine.on("tracks", handleEngineTracks);
    void engine.refreshTrackCatalog?.(controller.signal).catch(() => {
      // Track discovery is optional. Native tracks and playback stay usable
      // when the bridge cannot provide richer metadata.
    });

    return () => {
      controller.abort();
      engine.off("tracks", handleEngineTracks);
    };
  }, [engine, playbackUri, refreshPlayerTracks, setAudioTracks, setSubtitles]);

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
    const sourceLoadSub = player.addListener?.("sourceLoad", () => {
      appliedTrackPreferencesRef.current = null;
      refreshPlayerTracks();
      setTrackCatalogRevision((revision) => revision + 1);
    });

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
      Boolean(preferredAudioLang || originalLanguage) &&
      availableAudioTracks.length === 0;
    const waitingForPreferredSubtitles =
      Boolean(preferredSubtitleLang) &&
      availableSubtitleTracks.length === 0 &&
      subtitles.length === 0;
    if (waitingForPreferredAudio || waitingForPreferredSubtitles) return;

    const audioTrack = findPreferredPlayerTrack(
      availableAudioTracks,
      preferredAudioLang || originalLanguage,
    );
    if (audioTrack) {
      player.audioTrack = audioTrack;
    }

    if (subtitleMode === "off") {
      player.subtitleTrack = null;
      void handleSubtitleSelection(null);
    } else {
      const subtitleTrack = findPreferredPlayerTrack(
        availableSubtitleTracks,
        preferredSubtitleLang,
      );
      if (subtitleTrack) {
        player.subtitleTrack = subtitleTrack;
      } else if (preferredSubtitleLang && subtitles.length > 0) {
        const preferredLanguage = normalizeTrackLanguage(preferredSubtitleLang);
        const candidates = subtitles
          .filter(
            (track) =>
              normalizeTrackLanguage(track.language) === preferredLanguage,
          )
          .sort((left, right) => {
            const accessibilityScore = (track: typeof left) =>
              subtitleAccessibility === "prefer"
                ? Number(Boolean(track.hearingImpaired))
                : subtitleAccessibility === "avoid"
                  ? Number(!track.hearingImpaired)
                  : 0;
            return (
              accessibilityScore(right) - accessibilityScore(left) ||
              Number(Boolean(right.forced)) - Number(Boolean(left.forced)) ||
              left.id.localeCompare(right.id)
            );
          });
        const selectedAudioLanguage = normalizeTrackLanguage(
          player.audioTrack?.language ||
            audioTracks.find((track) => track.active)?.language,
        );
        const engineSubtitle = candidates.find(
          (track) =>
            subtitleMode === "always" ||
            track.forced ||
            selectedAudioLanguage !== preferredLanguage,
        );
        if (engineSubtitle) {
          void handleSubtitleSelection(engineSubtitle.id);
        }
      }
    }

    appliedTrackPreferencesRef.current = playbackUri;
    refreshPlayerTracks();
  }, [
    player,
    playbackUri,
    audioTracks.length,
    handleSubtitleSelection,
    preferredAudioLang,
    preferredSubtitleLang,
    originalLanguage,
    refreshPlayerTracks,
    subtitleAccessibility,
    subtitleMode,
    subtitles.length,
    trackCatalogRevision,
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
  const isProgressiveRemuxPlayback =
    currentStream?.behaviorHints?.remuxStrategy === "progressive-fmp4";
  const isRemuxPlayback = Boolean(
    currentStream?.behaviorHints?.remuxToMp4 ||
    isProgressiveRemuxPlayback ||
    selectedSessionCandidate?.requiresRemux,
  );
  const isLivePlayback = Boolean(
    !isRemuxPlayback &&
    currentStream?.url?.toLowerCase().includes(".m3u8") &&
    !hasKnownDuration,
  );
  const hasSeekableProgressiveHandoff =
    isProgressiveRemuxPlayback && seekableHandoffApplied;
  const canSeekPlayback = Boolean(
    !activeCast &&
    (!isRemuxPlayback || hasSeekableProgressiveHandoff) &&
    hasKnownDuration &&
    !isLivePlayback,
  );
  const activePlaybackSegment = useMemo(
    () =>
      canSeekPlayback
        ? getActivePlaybackSegment(playbackSegments, acceptedCurrentTime)
        : null,
    [acceptedCurrentTime, canSeekPlayback, playbackSegments],
  );
  const playbackDiagnostics = useMemo(
    () =>
      buildPlaybackDiagnostics({
        engineType: engine?.getEngineType() || "unknown",
        sourceKind: currentStream?.infoHash
          ? "torrent"
          : currentStream?.url?.startsWith("file:")
            ? "offline"
            : currentStream?.url?.toLowerCase().includes(".m3u8")
              ? "hls"
              : currentStream?.url
                ? "direct"
                : "unknown",
        runtimeState: runtimeViewState.kind,
        seekable: canSeekPlayback,
        positionSeconds: acceptedCurrentTime,
        durationSeconds: playerDuration,
        bufferedSeconds: mediaAdapter.snapshot().bufferedPosition,
        audioLabel:
          audioTracks.find((track) => track.active)?.label || undefined,
        subtitleLabel:
          subtitles.find((track) => track.active)?.label || undefined,
        observation: playbackDiagnosticsRecorderRef.current.snapshot(),
      }),
    [
      acceptedCurrentTime,
      audioTracks,
      canSeekPlayback,
      currentStream?.infoHash,
      currentStream?.url,
      diagnosticsRevision,
      engine,
      mediaAdapter,
      playerDuration,
      runtimeViewState.kind,
      subtitles,
    ],
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
      isProgressiveRemux: isProgressiveRemuxPlayback && !seekableHandoffApplied,
      seekableCacheStatus:
        isProgressiveRemuxPlayback && !seekableHandoffApplied
          ? seekableCacheStatus === "ready"
            ? undefined
            : seekableCacheStatus
          : undefined,
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
      isProgressiveRemuxPlayback,
      isRemuxPlayback,
      mediaInfo,
      playbackSessionId,
      runtimeError,
      seekableCacheStatus,
      seekableHandoffApplied,
      subtitles.length,
    ],
  );

  // A primary torrent starts as a live fragmented MP4 so it can show a frame
  // quickly. The bridge prepares its range-seekable cache only after that
  // first consumer exists. Poll that one existing gateway job here; this
  // never plans a second candidate or creates another torrent.
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
    seekableHandoffControllerRef.current?.abort();
    seekableHandoffControllerRef.current = controller;
    const sessionSnapshot = {
      sessionId: playbackSessionId,
      candidateId: playbackCandidateId,
      attemptId: playbackAttemptId,
    };
    // The opaque gateway ID is already session-owned state, so using it here
    // prevents a late monitor from ever observing a gateway job selected by a
    // different candidate or player.
    let expectedGatewayJobId: string | undefined = activeGatewayJobId;

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
        state.currentStream?.behaviorHints?.remuxStrategy === "progressive-fmp4"
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
        let handoff;
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
        seekableHandoffInFlightRef.current = true;
        seekableHandoffShouldResumeRef.current = shouldResume;
        pausedAfterSeekableHandoffRef.current = !shouldResume;
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
          seekableHandoffInFlightRef.current = false;
          seekableHandoffShouldResumeRef.current = null;
          if (shouldResume) {
            pausedAfterSeekableHandoffRef.current = false;
          }
        }
      }
    };

    void monitor();
    return () => {
      controller.abort();
      if (seekableHandoffControllerRef.current === controller) {
        seekableHandoffControllerRef.current = null;
      }
    };
  }, [
    activeCast,
    activeGatewayJobId,
    beginProgressSourceReplacement,
    completeProgressSourceReplacement,
    engine,
    hasPlaybackStarted,
    isProgressiveRemuxPlayback,
    playbackAttemptId,
    playbackCandidateId,
    playbackSessionId,
    playbackUri,
    player,
    recordDiagnostic,
    seekableHandoffApplied,
    setBuffering,
    setPlaying,
    setRuntimeState,
    setStreamStatus,
  ]);

  useEffect(() => {
    if (player && player.playbackRate !== playbackRate) {
      player.playbackRate = playbackRate;
    }
  }, [player, playbackRate]);

  const {
    muted,
    volume,
    handleSeekBy,
    handleSeekTo,
    handlePreviewSeek,
    handleScrubbingChange,
    getTimelineThumbnail,
    handleSeekPercent,
    handleToggleMute,
    handleVolumeChange,
  } = usePlayerMediaControls({
    player,
    mediaAdapter,
    engine,
    canSeek: canSeekPlayback,
    markIntentionalSeek,
    recordDiagnostic,
    recordExplicitSeek,
    setShowNextEpisodeOverlay,
    showControls,
    dispatchRuntimeViewEvent,
  });

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

  const styles = useMemo(
    () => createPlayerScreenStyles(colors, isDark),
    [colors, isDark],
  );

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
          fallbackReason={visibleFallbackReason}
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
          fallbackReason={visibleFallbackReason}
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
                  onFirstFrameRender={handleFirstFrameRendered}
                />
              )}

              <PlayerInteractionLayer
                onTapSide={handleTap}
                onToggleControls={toggleControls}
              />
              <ExternalSubtitleRenderer
                cues={externalSubtitleCues}
                currentTime={acceptedCurrentTime}
                offsetSeconds={subtitleSyncOffsetSeconds}
                textSize={subtitleTextSize}
                background={subtitleBackground}
                backgroundOpacity={subtitleBackgroundOpacity}
                verticalPosition={subtitleVerticalPosition}
                fontFamily={subtitleFontFamily}
                controlsVisible={controlsVisible}
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
            fallbackReason={previewControls ? null : visibleFallbackReason}
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
            currentTime={mediaAdapter.snapshot().currentTime}
            duration={playerDuration}
            bufferedPosition={mediaAdapter.snapshot().bufferedPosition}
            isVisible={
              (controlsVisible || runtimeViewState.kind === "scrubbing") &&
              !activeCast
            }
            isPlaying={player?.playing ?? false}
            capabilities={
              previewControls
                ? { ...playerCapabilities, canRetry: false, canCast: false }
                : playerCapabilities
            }
            sourceLabel={sourceLabel}
            castStatus={castStatus}
            downloadStatus={downloadStatus}
            fallbackReason={previewControls ? null : visibleFallbackReason}
            audioStatus={
              audioTracks.find((track) => track.active)?.label || null
            }
            subtitleStatus={
              (subtitleLoadState === "loading"
                ? t("player.settings.subtitleLoading", {
                    defaultValue: "Loading subtitles",
                  })
                : subtitleLoadState === "error"
                  ? t("player.settings.subtitleUnavailable", {
                      defaultValue: "Subtitles unavailable",
                    })
                  : subtitles.find((track) => track.active)?.label) ||
              (subtitles.length > 0
                ? t("player.settings.off", { defaultValue: "Subtitles off" })
                : null)
            }
            activeSegment={activePlaybackSegment}
            muted={muted}
            volume={volume}
            onSeekBy={handleSeekBy}
            onSeekTo={handleSeekTo}
            onPreviewSeek={handlePreviewSeek}
            onScrubbingChange={handleScrubbingChange}
            getThumbnail={getTimelineThumbnail}
            onToggleMute={handleToggleMute}
            onVolumeChange={handleVolumeChange}
            onToggleFullscreen={handleToggleFullscreen}
            onOpenSettings={() => {
              setShowNextEpisodeOverlay(false);
              setSettingsOpen(true);
            }}
            onOpenCast={() => setCastModalOpen(true)}
            onRetry={handleRetryPlayback}
            onSkipSegment={handleSeekTo}
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
              try {
                const switched = Boolean(
                  id && mediaAdapter.selectAudioTrack(id),
                );
                recordDiagnostic({
                  type: "audio_switch",
                  outcome: switched ? "succeeded" : "failed",
                });
              } catch {
                recordDiagnostic({
                  type: "audio_switch",
                  outcome: "failed",
                });
              }
              refreshPlayerTracks();
            }}
            onSelectSubtitle={(id: string | null) => {
              void handleSubtitleSelection(id);
            }}
            playbackRate={playbackRate}
            onSelectPlaybackRate={setPlaybackRate}
            subtitleMode={subtitleMode}
            onSelectSubtitleMode={(mode) => {
              appliedTrackPreferencesRef.current = null;
              setSubtitleMode(mode);
              if (mode === "off") {
                void handleSubtitleSelection(null);
              }
            }}
            subtitleAccessibility={subtitleAccessibility}
            onSelectSubtitleAccessibility={(preference) => {
              appliedTrackPreferencesRef.current = null;
              setSubtitleAccessibility(preference);
            }}
            subtitleTextSize={subtitleTextSize}
            onSelectSubtitleTextSize={setSubtitleTextSize}
            subtitleBackground={subtitleBackground}
            onSelectSubtitleBackground={setSubtitleBackground}
            subtitleBackgroundOpacity={subtitleBackgroundOpacity}
            onSelectSubtitleBackgroundOpacity={setSubtitleBackgroundOpacity}
            subtitleVerticalPosition={subtitleVerticalPosition}
            onSelectSubtitleVerticalPosition={setSubtitleVerticalPosition}
            subtitleFontFamily={subtitleFontFamily}
            onSelectSubtitleFontFamily={setSubtitleFontFamily}
            subtitleSyncOffsetSeconds={subtitleSyncOffsetSeconds}
            onSelectSubtitleSyncOffset={setSubtitleSyncOffsetSeconds}
            onResetSubtitleStyle={resetSubtitleStyle}
            diagnostics={playbackDiagnostics}
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
