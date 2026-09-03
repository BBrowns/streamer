import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useReducer,
} from "react";
import {
  AccessibilityInfo,
  AppState,
  View,
  Text,
  Pressable,
  Platform,
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
import { usePlayerMediaControls } from "../hooks/usePlayerMediaControls";
import { usePlayerCastController } from "../hooks/usePlayerCastController";
import { usePlaybackSessionBinding } from "../hooks/usePlaybackSessionBinding";
import {
  usePlaybackUriBinding,
  type PlaybackUriMessage,
} from "../hooks/usePlaybackUriBinding";
import { useSeekableCacheHandoff } from "../hooks/useSeekableCacheHandoff";
import { usePlayerTrackCatalog } from "../hooks/usePlayerTrackCatalog";

// UI Components
import { PlayerOverlay } from "../components/player/PlayerOverlay";
import { PlayerSettingsModal } from "../components/player/PlayerSettingsModal";
import { MediaArtwork } from "../components/ui/MediaArtwork";
import { PlayerStatusOverlay } from "../components/player/PlayerStatusOverlay";
import { PlayerControls } from "../components/player/PlayerControls";
import { HlsVideoSurface } from "../components/player/HlsVideoSurface";
import { PlayerInteractionLayer } from "../components/player/PlayerInteractionLayer";
import { NextEpisodeOverlay } from "../components/player/NextEpisodeOverlay";
import { ResumePrompt } from "../components/player/ResumePrompt";
import { DesktopCastModal } from "../components/DesktopCastModal";
import { goBackOrReplace } from "../lib/navigation";
import {
  createPlaybackRuntimeError,
  mapPlaybackMessageToRuntimeFailure,
} from "../services/playback/PlaybackErrors";
import { getUnsupportedWebCodecReason } from "../services/streamEngine/codecSupport";
import {
  findPreferredPlayerTrack,
  normalizeTrackLanguage,
} from "../services/playback/trackSelection";
import { playBest } from "../services/playback/PlaybackOrchestrator";
import { beginPlaybackLaunch } from "../services/playback/PlaybackLaunchService";
import {
  cancelPlaybackSession,
  getActivePlaybackSourceRuntime,
  markPlaybackSessionBuffering,
  markPlaybackSessionPlaying,
} from "../services/playback/PlaybackSessionPlaybackService";
import { PlaybackStatusPanel } from "../components/ui/PlaybackStatusPanel";
import {
  PLAYBACK_SEEK_GRACE_PERIOD_MS,
  PLAYBACK_STALL_CHECK_INTERVAL_MS,
  hasPlaybackProgressed,
  shouldAdvanceAfterPlaybackStall,
} from "../components/player/playbackStallWatchdog";
import { createMediaPlayerAdapter } from "../services/playback/mediaPlayerAdapters";
import {
  createHlsPlayerFacade,
  HlsWebVideoAdapter,
} from "../services/playback/mediaPlayerAdapters/HlsWebVideoAdapter";
import { resolveEffectivePlayerCapabilities } from "../services/playback/PlayerCapabilityPolicy";
import {
  initialPlaybackRuntimeViewState,
  reducePlaybackRuntimeViewState,
} from "../services/playback/PlaybackRuntimeCoordinator";
import { ExternalSubtitleRenderer } from "../components/player/ExternalSubtitleRenderer";
import { resolveFallbackResumePosition } from "../services/playback/FallbackContinuity";
import {
  buildPlaybackDiagnostics,
  PlaybackDiagnosticsRecorder,
  toPlaybackDiagnosticBreadcrumb,
  type PlaybackDiagnosticEvent,
} from "../services/playback/PlaybackDiagnostics";
import { addMobileBreadcrumb } from "../services/sentryBreadcrumbs";
import { refreshBridgeReadiness } from "../services/streamEngine/bridgeReadinessRuntime";
import { recordPlaybackDebugEvent } from "../services/playback/playbackDebug";
import { getActivePlaybackSegment } from "../services/playback/PlaybackSegmentsProvider";
import { createPlayerScreenStyles } from "../components/player/playerScreenStyles";
import { useWindowClass } from "../hooks/useWindowClass";
import {
  useCinematicTheme,
  useCinematicThemeSource,
} from "../contexts/CinematicThemeContext";
import {
  getPlayerChromeAutoHideDelay,
  shouldAutoHidePlayerChrome,
} from "../components/player/playerChromePolicy";

const DOUBLE_TAP_DELAY = 300;
const SEEK_SECONDS = 10;
const PLAYBACK_START_TIMEOUT_MS = 60_000;
const AUDIO_TRACK_SWITCH_TIMEOUT_MS = 20_000;
const MAX_PLAYBACK_DIAGNOSTIC_BREADCRUMBS = 24;

type SeekableCacheStatus =
  "not_started" | "evaluating" | "preparing" | "ready" | "unavailable";

function getPlayerVisibility() {
  if (AppState.currentState !== "active") return false;
  if (Platform.OS !== "web" || typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

function resolveOwnedWebVideoElement(surface: any) {
  if (!surface) return null;
  if (surface.tagName?.toLowerCase?.() === "video") return surface;
  return typeof surface.querySelector === "function"
    ? surface.querySelector("video")
    : null;
}

export default function PlayerScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { isCompact } = useWindowClass();

  const currentStream = usePlayerStore((s) => s.currentStream);
  const mediaInfo = usePlayerStore((s) => s.mediaInfo);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
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
  const preferredQualities = usePlayerStore((s) => s.preferredQualities);
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
  const setPreferredQualities = usePlayerStore((s) => s.setPreferredQualities);
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
  const setProgress = usePlayerStore((s) => s.setProgress);
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

  useCinematicThemeSource(
    mediaInfo
      ? {
          contentKey: `${mediaInfo.type}:${mediaInfo.itemId}`,
          backgroundUri: mediaInfo.background,
          posterUri: mediaInfo.poster,
        }
      : null,
  );
  const { theme: cinematicTheme } = useCinematicTheme();
  const activeSession = usePlaybackSessionStore((s) =>
    playbackSessionId ? s.sessions[playbackSessionId] || null : null,
  );
  const {
    activeCast,
    castModalOpen,
    openCastModal,
    closeCastModal,
    handleCastStarted,
    stopCasting,
    stopCastingOnPlayerClose,
  } = usePlayerCastController({ router, currentStream });
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
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsFocused, setControlsFocused] = useState(false);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [previewControls, setPreviewControls] = useState(false);
  const [fallbackStatusMessage, setFallbackStatusMessage] = useState<
    string | null
  >(null);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [seekableCacheStatus, setSeekableCacheStatus] =
    useState<SeekableCacheStatus>("not_started");
  const [seekableHandoffApplied, setSeekableHandoffApplied] = useState(false);
  const [diagnosticsRevision, setDiagnosticsRevision] = useState(0);
  const [runtimeViewState, dispatchRuntimeViewEvent] = useReducer(
    reducePlaybackRuntimeViewState,
    initialPlaybackRuntimeViewState,
  );
  const visibleFallbackReason = fallbackReason || fallbackStatusMessage;
  const controlsAutoHideAllowed = shouldAutoHidePlayerChrome({
    isPlaying,
    isScrubbing: runtimeViewState.kind === "scrubbing",
    settingsOpen,
    hasControlFocus: controlsFocused,
    screenReaderEnabled,
  });
  const controlsAutoHideDelay = getPlayerChromeAutoHideDelay(isCompact);

  const [seekFeedback, setSeekFeedback] = useState<"left" | "right" | null>(
    null,
  );
  const lastTapRef = useRef<{ time: number; side: "left" | "right" } | null>(
    null,
  );
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsAutoHideAllowedRef = useRef(controlsAutoHideAllowed);
  controlsAutoHideAllowedRef.current = controlsAutoHideAllowed;
  const videoViewRef = useRef<any>(null);
  const appliedTrackPreferencesRef = useRef<string | null>(null);
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
  const seekableHandoffInFlightRef = useRef(false);
  const seekableHandoffShouldResumeRef = useRef<boolean | null>(null);
  const pausedAfterSeekableHandoffRef = useRef(false);
  const playbackDiagnosticsRecorderRef = useRef(
    new PlaybackDiagnosticsRecorder(),
  );
  const playbackDiagnosticBreadcrumbCountRef = useRef(0);
  const planObservedKeyRef = useRef<string | null>(null);

  const recordDiagnostic = useCallback((event: PlaybackDiagnosticEvent) => {
    playbackDiagnosticsRecorderRef.current.record(event);
    const breadcrumb = toPlaybackDiagnosticBreadcrumb(event);
    if (
      breadcrumb &&
      playbackDiagnosticBreadcrumbCountRef.current <
        MAX_PLAYBACK_DIAGNOSTIC_BREADCRUMBS
    ) {
      addMobileBreadcrumb(breadcrumb);
      playbackDiagnosticBreadcrumbCountRef.current += 1;
    }
    setDiagnosticsRevision((revision) => revision + 1);
  }, []);

  const abortSeekableHandoff = useCallback(() => {
    seekableHandoffControllerRef.current?.abort();
    seekableHandoffControllerRef.current = null;
  }, []);

  const requestLegacyFallback = useCallback(() => {
    setPlaybackUri(null);
    setResolveAttempt((attempt) => attempt + 1);
  }, []);

  const getFallbackStatusMessage = useCallback(
    () =>
      t("player.status.tryingFallback", {
        defaultValue: "Trying another source...",
      }),
    [t],
  );

  const getPlaybackUriErrorMessage = useCallback(
    (message: PlaybackUriMessage) => {
      switch (message) {
        case "unsupportedCodec":
          return t("player.errors.unsupportedCodec");
        case "bridgeUnavailable":
          return t("player.errors.bridgeUnavailable");
        case "noStream":
          return t("player.errors.noStream");
        case "playbackFailed":
          return t("player.errors.playbackFailed");
      }
      return t("player.errors.playbackFailed");
    },
    [t],
  );

  const {
    launchOwnedSessionIdRef,
    partialReplanControllerRef,
    fallbackInFlightRef,
    pendingFallbackRestoreRef,
    tryReplanPartialPlayback,
    cancelOwnedPlayback,
    getOwnedSessionId,
    tryAdvanceToFallback,
  } = usePlaybackSessionBinding({
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
  });

  usePlaybackUriBinding({
    currentStream,
    mediaInfo,
    playbackSessionId,
    playbackCandidateId,
    playbackAttemptId,
    resolveAttempt,
    setPlaybackUri,
    setStreamStatus,
    setSessionStream,
    setRuntimeFailure,
    getErrorMessage: getPlaybackUriErrorMessage,
    tryReplanPartialPlayback,
    tryAdvanceToFallback,
  });

  useEffect(() => {
    playbackDiagnosticsRecorderRef.current = new PlaybackDiagnosticsRecorder();
    playbackDiagnosticBreadcrumbCountRef.current = 0;
    planObservedKeyRef.current = null;
    setDiagnosticsRevision((revision) => revision + 1);
  }, [
    mediaInfo?.episode,
    mediaInfo?.itemId,
    mediaInfo?.season,
    mediaInfo?.type,
    playbackSessionId,
  ]);

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

  const scheduleControlsHide = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (!controlsAutoHideAllowedRef.current) return;
    controlsTimerRef.current = setTimeout(
      () => setControlsVisible(false),
      controlsAutoHideDelay,
    );
  }, [controlsAutoHideDelay]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  useEffect(() => {
    if (!controlsAutoHideAllowed) {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      setControlsVisible(true);
      return;
    }
    if (controlsVisible) scheduleControlsHide();
  }, [controlsAutoHideAllowed, controlsVisible, scheduleControlsHide]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReaderEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReaderEnabled,
    );
    return () => {
      mounted = false;
      subscription.remove();
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
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
      const hadSession = Boolean(playbackSessionId || getOwnedSessionId());
      cancelOwnedPlayback(reason);
      seekableHandoffControllerRef.current?.abort();
      seekableHandoffControllerRef.current = null;
      stopCastingOnPlayerClose();
      if (!hadSession && currentStream) {
        streamEngineManager.resolveEngine(currentStream)?.stop?.();
      }
      goBackOrReplace(router);
      setTimeout(() => clearPlayer(), 100);
    },
    [
      clearPlayer,
      cancelOwnedPlayback,
      currentStream,
      getOwnedSessionId,
      playbackSessionId,
      router,
      stopCastingOnPlayerClose,
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
    cancelOwnedPlayback("User opened Sources & Devices.", {
      removeSession: true,
    });
    seekableHandoffControllerRef.current?.abort();
    seekableHandoffControllerRef.current = null;
    clearPlayer();
    router.replace("/settings/sources");
  }, [cancelOwnedPlayback, clearPlayer, router]);

  const handleChooseSource = useCallback(() => {
    if (!mediaInfo) return;
    cancelOwnedPlayback("User chose advanced source selection.");
    seekableHandoffControllerRef.current?.abort();
    seekableHandoffControllerRef.current = null;
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
  }, [cancelOwnedPlayback, clearPlayer, mediaInfo, router]);

  useEffect(
    () => () => {
      seekableHandoffControllerRef.current?.abort();
      seekableHandoffControllerRef.current = null;
    },
    [],
  );

  // Cast sessions intentionally outlive this route. They only stop after an
  // explicit stop/close action, so navigation cannot silently end playback.

  const handleRetryPlayback = useCallback(async () => {
    setFallbackStatusMessage(null);
    seekableHandoffControllerRef.current?.abort();
    seekableHandoffControllerRef.current = null;
    if (!currentStream && planningLaunchId && mediaInfo) {
      cancelOwnedPlayback("User retried playback planning.", {
        removeSession: true,
      });
      const launchId = beginPlaybackLaunch({
        type: mediaInfo.type,
        id: mediaInfo.itemId,
        title: mediaInfo.title,
        poster: mediaInfo.poster,
        background: mediaInfo.background,
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
          background: mediaInfo.background,
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
      await refreshBridgeReadiness();
    }
    setResolveAttempt((attempt) => attempt + 1);
  }, [
    currentStream,
    cancelOwnedPlayback,
    mediaInfo,
    planningLaunchId,
    playbackSessionId,
    setPlaybackPlanning,
    setFallbackStatusMessage,
    setRuntimeFailure,
    setSessionStream,
    setStreamStatus,
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

  // Read the attempt-owned route before creating the media adapter. This is
  // important for an unknown torrent: the planner may request HLS, while the
  // gateway can safely demote the same job to range-http after proving the
  // selected file is already an MP4.
  const activeSourceRoute =
    playbackSessionId && playbackAttemptId
      ? getActivePlaybackSourceRuntime(playbackSessionId, playbackAttemptId)
          ?.route
      : undefined;
  const hlsPlaybackRequested =
    Platform.OS === "web" &&
    (activeSourceRoute?.delivery === "hls" ||
      (!activeSourceRoute &&
        currentStream?.behaviorHints?.remuxStrategy === "hls"));
  const player = useVideoPlayer(
    hlsPlaybackRequested ? "" : playbackUri || "",
    (p) => {
      p.staysActiveInBackground = true;
      p.showNowPlayingNotification = true;
      if (!hlsPlaybackRequested) p.play();
    },
  );
  const platformPiPSupported = useMemo(() => {
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
  const mediaAdapter = useMemo(
    () =>
      createMediaPlayerAdapter({
        player,
        native: {
          resolveSurface: () => videoViewRef.current,
          pictureInPictureSupported: platformPiPSupported,
        },
        web: {
          resolveVideoElement: () =>
            resolveOwnedWebVideoElement(videoViewRef.current),
        },
        hls: hlsPlaybackRequested,
      }),
    [hlsPlaybackRequested, platformPiPSupported, player],
  );
  const hlsAdapter =
    mediaAdapter instanceof HlsWebVideoAdapter ? mediaAdapter : null;
  const controllerPlayer = useMemo(
    () => (hlsAdapter ? createHlsPlayerFacade(hlsAdapter) : player),
    [hlsAdapter, player],
  );
  const audioReplacementInFlightRef = useRef(false);

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
    setPlaying(mediaAdapter.snapshot().playing);
    setStreamStatus("playing");
    setFallbackStatusMessage(null);
  }, [
    playbackSessionId,
    playbackSessionCreatedAt,
    mediaAdapter,
    player,
    recordDiagnostic,
    setBuffering,
    setPlaying,
    setStreamStatus,
  ]);

  // HLS on web/Electron has its own HTMLMediaElement lifecycle. Keep it on
  // the same application-facing adapter so controls, first-frame state and
  // progress reporting do not observe the unused Expo player.
  useEffect(() => {
    if (!hlsAdapter || !playbackUri || !currentStream) return;

    dispatchRuntimeViewEvent({ type: "media_loading" });
    setBuffering(true);
    playbackStartedRef.current = false;
    setHasPlaybackStarted(false);

    const unsubscribe = hlsAdapter.subscribe((event) => {
      if (event.type === "status_changed") {
        if (event.status === "loading") {
          setBuffering(true);
          return;
        }
        if (event.status === "ready") {
          // Audio-variant replacement owns its own ready/pause decision. Do
          // not let the initial HLS observer auto-play a source while a
          // failed replacement is being rolled back.
          if (audioReplacementInFlightRef.current) return;
          dispatchRuntimeViewEvent({ type: "media_ready", shouldPlay: true });
          hlsAdapter.play();
          return;
        }
        if (event.status === "error") {
          if (audioReplacementInFlightRef.current) return;
          const failure = createPlaybackRuntimeError(
            "SOURCE_UNAVAILABLE",
            t("player.errors.playbackFailed"),
            { retryable: true, shouldFallback: false },
          );
          void tryAdvanceToFallback(failure, failure.message).then(
            (advanced) => {
              if (advanced) return;
              setBuffering(false);
              setPlaying(false);
              setRuntimeFailure(failure);
            },
          );
        }
        return;
      }

      if (event.type === "first_frame_rendered") {
        handleFirstFrameRendered();
        return;
      }

      if (event.type === "playing_changed") {
        setPlaying(event.playing);
        dispatchRuntimeViewEvent({
          type: "playing_changed",
          isPlaying: event.playing,
        });
        if (event.playing) setStreamStatus("playing");
        return;
      }

      if (event.type === "time_updated") {
        const snapshot = hlsAdapter.snapshot();
        setProgress(snapshot.currentTime, snapshot.duration);
        return;
      }

      if (event.type === "seek_rejected") {
        setFallbackStatusMessage(
          t("player.controls.seekOutsideWindow", {
            defaultValue:
              "That position is not ready yet. Scrubbing is limited to the prepared window.",
          }),
        );
      }
    });

    return () => unsubscribe();
  }, [
    currentStream,
    dispatchRuntimeViewEvent,
    handleFirstFrameRendered,
    hlsAdapter,
    playbackUri,
    setBuffering,
    setPlaying,
    setProgress,
    setRuntimeFailure,
    setStreamStatus,
    setFallbackStatusMessage,
    t,
    tryAdvanceToFallback,
  ]);

  useEffect(() => {
    if (hlsAdapter || !player || !playbackUri || !currentStream) return;

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
        if (
          status === "loading" ||
          status === "readyToPlay" ||
          status === "error"
        ) {
          recordPlaybackDebugEvent({
            category: "playback",
            message: "player.status_changed",
            data: {
              status,
              sourceKind: currentStream?.infoHash
                ? "torrent"
                : currentStream?.url
                  ? "url"
                  : "unknown",
              hasPlaybackUri: Boolean(playbackUri),
              mediaErrorCode:
                typeof error?.code === "string"
                  ? error.code.slice(0, 80)
                  : undefined,
            },
          });
        }
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
    hlsAdapter,
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

  const handlePrematurePlaybackEnd = useCallback(() => {
    const fallbackMessage = t("player.status.playbackEndedTryingFallback", {
      defaultValue: "This source ended early. Trying another source.",
    });
    const failure = createPlaybackRuntimeError(
      "SOURCE_UNAVAILABLE",
      fallbackMessage,
      { retryable: true, shouldFallback: false },
    );
    recordPlaybackDebugEvent({
      category: "playback",
      message: "playback.progressive_source_ended_before_handoff",
      level: "warning",
      data: { hasSeekableHandoff: false },
    });
    void tryAdvanceToFallback(failure, fallbackMessage).then((advanced) => {
      if (advanced) return;
      setBuffering(false);
      setPlaying(false);
      setRuntimeFailure(failure);
    });
  }, [setBuffering, setPlaying, setRuntimeFailure, t, tryAdvanceToFallback]);

  const {
    audioTracks,
    subtitles: engineSubtitles,
    stats,
    engine,
    playbackRoute,
    bridgeJobId: preparedBridgeJobId,
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
    player: controllerPlayer,
    playbackUri,
    onClose: handleClose,
    showControls,
    isProgressiveRemux:
      currentStream?.behaviorHints?.remuxStrategy === "progressive-fmp4",
    hasSeekableHandoff: seekableHandoffApplied,
    onCompleted: handlePlaybackCompleted,
    onPrematureEnd: handlePrematurePlaybackEnd,
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

  const {
    subtitles,
    externalSubtitleCues,
    subtitleLoadState,
    trackCatalogRevision,
    handleSubtitleSelection,
    refreshPlayerTracks,
  } = usePlayerTrackCatalog({
    mediaInfo,
    engine,
    engineSubtitles,
    playbackRoute,
    playbackUri,
    player,
    mediaAdapter,
    setAudioTracks,
    setSubtitles,
    recordDiagnostic,
  });

  const progressiveAudioReplacement =
    playbackRoute?.delivery === "progressive-fmp4" ||
    currentStream?.behaviorHints?.remuxStrategy === "progressive-fmp4";
  const switchPlayerAudioTrack = useCallback(
    async (id: string, reportDiagnostic = true) => {
      if (!player || audioReplacementInFlightRef.current) return false;

      const adapterCapabilities = mediaAdapter.getCapabilities();
      const nativeTrackAvailable = mediaAdapter
        .getAudioTracks()
        .some((track) => track.kind === "audio" && track.id === id);
      if (adapterCapabilities.audioTracks && nativeTrackAvailable) {
        const switched = mediaAdapter.selectAudioTrack(id);
        if (reportDiagnostic) {
          recordDiagnostic({
            type: "audio_switch",
            outcome: switched ? "succeeded" : "failed",
          });
        }
        refreshPlayerTracks();
        return switched;
      }

      // A native player may advertise audio-track support while exposing only
      // one attached/default track. Bridge-owned variants must still go
      // through the transactional source replacement path below.
      if (typeof engine?.selectAudioTrack !== "function") {
        if (reportDiagnostic) {
          recordDiagnostic({ type: "audio_switch", outcome: "failed" });
        }
        return false;
      }

      audioReplacementInFlightRef.current = true;
      let nextUri: string | null = null;
      try {
        nextUri = (await engine?.selectAudioTrack?.(id)) ?? null;
      } catch {
        nextUri = null;
      }
      if (!nextUri) {
        audioReplacementInFlightRef.current = false;
        if (reportDiagnostic) {
          recordDiagnostic({ type: "audio_switch", outcome: "failed" });
        }
        return false;
      }

      const wasPlaying = mediaAdapter.snapshot().playing;
      const position = mediaAdapter.snapshot().currentTime;
      const previousUri =
        engine?.getActivePlaybackUri?.() || playbackUri || null;
      beginProgressSourceReplacement();

      const switched = await new Promise<boolean>((resolve) => {
        let settled = false;
        let replacementTimer: ReturnType<typeof setTimeout> | null = null;
        let mediaAdapterSubscription: (() => void) | undefined;
        const cleanup = () => {
          if (replacementTimer) {
            clearTimeout(replacementTimer);
            replacementTimer = null;
          }
          statusSubscription?.remove?.();
          sourceSubscription?.remove?.();
          mediaAdapterSubscription?.();
        };
        const restorePreviousSource = () => {
          if (!previousUri || previousUri === nextUri) return Promise.resolve();
          return new Promise<void>((resolveRestore) => {
            let restored = false;
            let restoreTimer: ReturnType<typeof setTimeout> | null = null;
            let restoreSubscription: (() => void) | undefined;
            const completeRestore = () => {
              if (restored) return;
              restored = true;
              if (restoreTimer) clearTimeout(restoreTimer);
              restoreSubscription?.();
              resolveRestore();
            };
            restoreSubscription = mediaAdapter.subscribe((event) => {
              if (
                (event.type === "status_changed" && event.status === "ready") ||
                event.type === "source_loaded"
              ) {
                if (!hlsAdapter || hlsAdapter.snapshot().status === "ready") {
                  completeRestore();
                }
              }
            });
            restoreTimer = setTimeout(
              completeRestore,
              AUDIO_TRACK_SWITCH_TIMEOUT_MS,
            );
            restoreTimer.unref?.();
            void mediaAdapter
              .replaceSource(previousUri)
              .then(completeRestore, completeRestore);
          });
        };
        const finish = async (success: boolean) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (!success) await restorePreviousSource();
          audioReplacementInFlightRef.current = false;
          if (success) {
            // A live progressive remux is intentionally non-seekable until a
            // cache handoff exists. Keep the replacement deterministic rather
            // than issuing a non-zero Range request that the gateway rejects.
            const resumeAt = progressiveAudioReplacement ? 0 : position;
            engine?.commitAudioTrackSelection?.(id, nextUri);
            recordExplicitSeek(resumeAt);
            completeProgressSourceReplacement(resumeAt);
            mediaAdapter.commitSeek(resumeAt);
            if (wasPlaying) mediaAdapter.play();
            else mediaAdapter.pause();
          } else {
            completeProgressSourceReplacement(position);
            if (wasPlaying) mediaAdapter.play();
            else mediaAdapter.pause();
          }
          resolve(success);
        };
        const restoreWhenReady = (status?: string) => {
          if (
            status === "readyToPlay" ||
            (hlsAdapter && hlsAdapter.snapshot().status === "ready")
          ) {
            finish(true);
          }
        };
        const statusSubscription = hlsAdapter
          ? undefined
          : player.addListener?.(
              "statusChange",
              ({ status }: { status?: string }) => restoreWhenReady(status),
            );
        const sourceSubscription = hlsAdapter
          ? undefined
          : player.addListener?.("sourceLoad", () =>
              restoreWhenReady(player.status),
            );
        if (hlsAdapter) {
          mediaAdapterSubscription = mediaAdapter.subscribe((event) => {
            if (
              (event.type === "status_changed" && event.status === "ready") ||
              event.type === "source_loaded"
            ) {
              restoreWhenReady();
            } else if (
              event.type === "status_changed" &&
              event.status === "error"
            ) {
              void finish(false);
            }
          });
        }
        replacementTimer = setTimeout(
          () => finish(false),
          AUDIO_TRACK_SWITCH_TIMEOUT_MS,
        );
        replacementTimer.unref?.();

        void mediaAdapter.replaceSource(nextUri).then(
          () => restoreWhenReady(hlsAdapter ? undefined : player.status),
          () => void finish(false),
        );
      });

      if (reportDiagnostic) {
        recordDiagnostic({
          type: "audio_switch",
          outcome: switched ? "succeeded" : "failed",
        });
      }
      refreshPlayerTracks();
      return switched;
    },
    [
      beginProgressSourceReplacement,
      completeProgressSourceReplacement,
      progressiveAudioReplacement,
      engine,
      mediaAdapter,
      player,
      playbackUri,
      recordDiagnostic,
      refreshPlayerTracks,
    ],
  );

  useEffect(() => {
    if (!player || !playbackUri) return;
    if (appliedTrackPreferencesRef.current === playbackUri) return;

    const mediaCapabilities = mediaAdapter.getCapabilities();
    const availableAudioTracks = audioTracks;
    const availableSubtitleTracks = mediaCapabilities.embeddedSubtitles
      ? mediaAdapter.getSubtitleTracks()
      : [];
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
    if (audioTrack) void switchPlayerAudioTrack(audioTrack.id, false);

    if (subtitleMode === "off") {
      mediaAdapter.selectSubtitleTrack(null);
      void handleSubtitleSelection(null);
    } else {
      const subtitleTrack = findPreferredPlayerTrack(
        availableSubtitleTracks,
        preferredSubtitleLang,
      );
      if (subtitleTrack) {
        mediaAdapter.selectSubtitleTrack(subtitleTrack.id);
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
          mediaAdapter.getAudioTracks().find((track) => track.active)
            ?.language || audioTracks.find((track) => track.active)?.language,
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
    mediaAdapter,
    switchPlayerAudioTrack,
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

  const mediaSnapshot = mediaAdapter.snapshot();
  const playerDuration = mediaSnapshot.duration || player?.duration || 0;
  const hasKnownDuration =
    Number.isFinite(playerDuration) && playerDuration > 0;
  const isProgressiveRemuxPlayback = playbackRoute
    ? playbackRoute.delivery === "progressive-fmp4"
    : currentStream?.behaviorHints?.remuxStrategy === "progressive-fmp4";
  const isRemuxPlayback = Boolean(
    playbackRoute
      ? ["progressive-fmp4", "seekable-cache", "hls"].includes(
          playbackRoute.delivery,
        )
      : currentStream?.behaviorHints?.remuxToMp4 ||
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
  const effectivePlayerCapabilities = resolveEffectivePlayerCapabilities({
    route: playbackRoute,
    mediaAdapter: mediaAdapter.getCapabilities(),
    activeCast: Boolean(activeCast),
    isWeb: Platform.OS === "web",
    hasMediaInfo: Boolean(mediaInfo),
    hasKnownDuration,
    isLivePlayback,
    isRemuxPlayback,
    hasSeekableProgressiveHandoff,
    hasRuntimeThumbnailProvider: Boolean(engine?.getThumbnail),
  });
  const canSeekPlayback = effectivePlayerCapabilities.canSeek;
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
  const canUseTimelineThumbnails =
    effectivePlayerCapabilities.canUseTimelineThumbnails;
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
      canUseVolume: effectivePlayerCapabilities.canUseVolume,
      canUseFullscreen: effectivePlayerCapabilities.canUseFullscreen,
      hasCaptions: subtitles.length > 0,
      canCast: effectivePlayerCapabilities.canCast,
      canRetry: Boolean(playbackSessionId && (runtimeError || fallbackReason)),
    }),
    [
      canSeekPlayback,
      effectivePlayerCapabilities.canCast,
      effectivePlayerCapabilities.canUseFullscreen,
      effectivePlayerCapabilities.canUseVolume,
      fallbackReason,
      isLivePlayback,
      isProgressiveRemuxPlayback,
      isRemuxPlayback,
      playbackSessionId,
      runtimeError,
      seekableCacheStatus,
      seekableHandoffApplied,
      subtitles.length,
    ],
  );

  // A primary torrent starts as a live fragmented MP4 so it can show a frame
  // quickly. The bridge prepares its range-seekable cache only after that
  // first consumer exists. The hook polls that one existing gateway job and
  // owns the in-attempt source handoff without planning a second torrent.
  useSeekableCacheHandoff({
    player,
    playbackUri,
    engine,
    isProgressiveRemuxPlayback,
    hasPlaybackStarted,
    playbackSessionId,
    playbackCandidateId,
    playbackAttemptId,
    playbackDelivery: playbackRoute?.delivery,
    activeCast,
    seekableHandoffApplied,
    preparedBridgeJobId,
    activeGatewayJobId,
    controllerRef: seekableHandoffControllerRef,
    handoffInFlightRef: seekableHandoffInFlightRef,
    handoffShouldResumeRef: seekableHandoffShouldResumeRef,
    pausedAfterHandoffRef: pausedAfterSeekableHandoffRef,
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
  });

  useEffect(() => {
    if (mediaAdapter.snapshot().playbackRate !== playbackRate) {
      mediaAdapter.setPlaybackRate(playbackRate);
    }
  }, [mediaAdapter, playbackRate]);

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
    player: controllerPlayer,
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
    void mediaAdapter.requestFullscreen().then(() => showControls());
  }, [mediaAdapter, showControls]);

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
      closeCastModal();
      return true;
    }
    if (action === "cancelPreparation") {
      handleCancelPreparation();
      return true;
    }
    return false;
  }, [
    castModalOpen,
    closeCastModal,
    handleCancelPreparation,
    preparationActive,
    settingsOpen,
  ]);

  usePlayerHotkeys({
    player: controllerPlayer,
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
    void mediaAdapter.requestPictureInPicture();
  }, [mediaAdapter]);

  const isPiPSupported = effectivePlayerCapabilities.canUsePictureInPicture;

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
                <MediaArtwork
                  uri={activeCast.mediaInfo.poster}
                  variant="backdrop"
                  accessible={false}
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
              {hlsAdapter ? (
                <HlsVideoSurface
                  adapter={hlsAdapter}
                  source={playbackUri}
                  style={styles.webVideo}
                />
              ) : previewControls ? (
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
              onOpenSettings={() => {
                setShowNextEpisodeOverlay(false);
                setSettingsOpen(true);
              }}
              onWebCast={openCastModal}
              onTogglePiP={handleTogglePiP}
              isPiPSupported={isPiPSupported}
              showInfoBar={false}
              focusColor={cinematicTheme.focus}
              onControlFocusChange={setControlsFocused}
            />
          )}

          <PlayerControls
            player={controllerPlayer}
            currentTime={mediaSnapshot.currentTime}
            duration={playerDuration}
            bufferedPosition={mediaSnapshot.bufferedPosition}
            isVisible={
              (controlsVisible || runtimeViewState.kind === "scrubbing") &&
              !activeCast
            }
            isPlaying={isPlaying}
            capabilities={
              previewControls
                ? { ...playerCapabilities, canRetry: false, canCast: false }
                : playerCapabilities
            }
            title={mediaInfo?.title}
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
            getThumbnail={
              canUseTimelineThumbnails ? getTimelineThumbnail : undefined
            }
            onToggleMute={handleToggleMute}
            onVolumeChange={handleVolumeChange}
            onToggleFullscreen={handleToggleFullscreen}
            onOpenCast={openCastModal}
            onRetry={handleRetryPlayback}
            onSkipSegment={handleSeekTo}
            accent={cinematicTheme.accent}
            focusColor={cinematicTheme.focus}
            onControlFocusChange={setControlsFocused}
            onPlayPause={() => {
              if (previewControls) return;
              if (mediaAdapter.snapshot().playing) mediaAdapter.pause();
              else mediaAdapter.play();
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
              if (id) void switchPlayerAudioTrack(id);
            }}
            onSelectSubtitle={(id: string | null) => {
              void handleSubtitleSelection(id);
            }}
            playbackRate={playbackRate}
            onSelectPlaybackRate={setPlaybackRate}
            preferredQualities={preferredQualities}
            onSelectPreferredQualities={setPreferredQualities}
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
            accent={cinematicTheme.accent}
            focusColor={cinematicTheme.focus}
          />
        )}

        {castModalOpen && (
          <DesktopCastModal
            visible={castModalOpen}
            onClose={closeCastModal}
            orchestratorInput={
              mediaInfo
                ? {
                    type: mediaInfo.type,
                    id: mediaInfo.itemId,
                    title: mediaInfo.title,
                    poster: mediaInfo.poster,
                    background: mediaInfo.background,
                    season: mediaInfo.season,
                    episode: mediaInfo.episode,
                  }
                : undefined
            }
            playbackUri={playbackUri || ""}
            title={mediaInfo?.title || ""}
            onOpenSourcesDevices={() => {
              closeCastModal();
              router.push("/settings/sources" as any);
            }}
            onCastStart={(device, details) => {
              if (player?.playing) player.pause();
              handleCastStarted({
                device,
                mediaInfo: details.source?.mediaInfo ||
                  mediaInfo || {
                    type: "movie",
                    itemId: "unknown",
                    title: "Streamer",
                  },
                sessionId: details.sessionId,
              });
            }}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}
