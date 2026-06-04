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
import { VideoView, useVideoPlayer } from "expo-video";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";

import { useTheme } from "../hooks/useTheme";
import { usePlayerStore } from "../stores/playerStore";
import { usePlaybackSessionStore } from "../stores/playbackSessionStore";
import { usePlayerHotkeys } from "../hooks/usePlayerHotkeys";
import { streamEngineManager } from "../services/streamEngine/StreamEngineManager";
import { usePlayerController } from "../hooks/usePlayerController";

// UI Components
import { PlayerOverlay } from "../components/player/PlayerOverlay";
import { PlayerSettingsModal } from "../components/player/PlayerSettingsModal";
import { PlayerStatusOverlay } from "../components/player/PlayerStatusOverlay";
import { PlayerControls } from "../components/player/PlayerControls";
import { NextEpisodeOverlay } from "../components/player/NextEpisodeOverlay";
import { ResumePrompt } from "../components/player/ResumePrompt";
import { DesktopCastModal } from "../components/DesktopCastModal";
import { castService, type CastDevice } from "../services/CastService";
import { goBackOrReplace } from "../lib/navigation";
import { getUnsupportedWebCodecReason } from "../services/streamEngine/codecSupport";
import {
  createPlaybackRuntimeError,
  mapPlaybackMessageToRuntimeFailure,
} from "../services/playback/PlaybackErrors";
import { playBest } from "../services/playback/PlaybackOrchestrator";
import {
  advancePlaybackSessionAfterFailure,
  cancelPlaybackSession,
  markPlaybackSessionBuffering,
  markPlaybackSessionPlaying,
  resolvePlaybackSession,
} from "../services/playback/PlaybackSessionPlaybackService";

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
  const clearPlayer = usePlayerStore((s) => s.clearPlayer);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setBuffering = usePlayerStore((s) => s.setBuffering);
  const setStreamStatus = usePlayerStore((s) => s.setStreamStatus);
  const setRuntimeState = usePlayerStore((s) => s.setRuntimeState);
  const setRuntimeFailure = usePlayerStore((s) => s.setRuntimeFailure);
  const setSessionStream = usePlayerStore((s) => s.setSessionStream);
  const advanceToNextFallback = usePlayerStore((s) => s.advanceToNextFallback);
  const activeSession = usePlaybackSessionStore((s) =>
    playbackSessionId ? s.sessions[playbackSessionId] || null : null,
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [activeCastDevice, setActiveCastDevice] = useState<CastDevice | null>(
    null,
  );
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);

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

  const handleClose = useCallback(() => {
    if (playbackSessionId) {
      cancelPlaybackSession(playbackSessionId, "User left the player.");
    }
    goBackOrReplace(router);
    setTimeout(() => clearPlayer(), 100);
  }, [router, clearPlayer, playbackSessionId]);

  const handleOpenSourcesDevices = useCallback(() => {
    if (playbackSessionId) {
      cancelPlaybackSession(
        playbackSessionId,
        "User opened Sources & Devices.",
      );
    }
    clearPlayer();
    router.replace("/settings");
  }, [clearPlayer, playbackSessionId, router]);

  useEffect(
    () => () => {
      if (playbackSessionId) {
        cancelPlaybackSession(
          playbackSessionId,
          "Player screen was closed before playback completed.",
        );
      }
    },
    [playbackSessionId],
  );

  const handleRetryPlayback = useCallback(async () => {
    if (!currentStream) return;

    if (playbackSessionId && mediaInfo) {
      cancelPlaybackSession(playbackSessionId, "User retried playback.");
      setPlaybackUri(null);
      setStreamStatus("loading_metrics");
      const result = await playBest({
        type: mediaInfo.type,
        id: mediaInfo.itemId,
        title: mediaInfo.title,
        poster: mediaInfo.poster,
        season: mediaInfo.season,
        episode: mediaInfo.episode,
      });
      if (result.ok) {
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
    playbackSessionId,
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

  useEffect(() => {
    if (player && player.playbackRate !== playbackRate) {
      player.playbackRate = playbackRate;
    }
  }, [player, playbackRate]);

  usePlayerHotkeys({
    player,
    showControls,
    setSeekFeedback,
    seekFeedbackTimer,
    SEEK_SECONDS,
  });

  const stopCasting = async () => {
    if (!activeCastDevice) return;
    try {
      await castService.control(activeCastDevice.id, "stop");
    } catch (e) {
      console.error("Failed to stop cast", e);
    }
    setActiveCastDevice(null);
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
        player?.seekBy(side === "right" ? SEEK_SECONDS : -SEEK_SECONDS);
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
    [player, toggleControls],
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

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (currentStream && !playbackUri) {
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
          onOpenSourcesDevices={
            currentStream.infoHash ? handleOpenSourcesDevices : undefined
          }
        />
      </View>
    );
  }

  if (!currentStream) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="light" />
        <Text style={styles.errorText}>{t("player.errors.noStream")}</Text>
        <View style={styles.errorActions}>
          <Pressable style={styles.errorButton} onPress={handleClose}>
            <Text style={styles.errorButtonText}>
              {t("player.errors.goBack")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.videoContainer}>
          {activeCastDevice ? (
            <View style={styles.castContainer}>
              {mediaInfo?.poster && (
                <Image
                  source={{ uri: mediaInfo.poster }}
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
                  {t("player.casting.to", { name: activeCastDevice.name })}
                </Text>
                <Pressable style={styles.stopCastBtn} onPress={stopCasting}>
                  <Ionicons name="stop-circle" size={24} color={colors.error} />
                  <Text style={styles.stopCastText}>
                    {t("player.casting.stop")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <VideoView
                ref={videoViewRef}
                player={player}
                style={styles.webVideo}
                nativeControls={false}
                contentFit="contain"
                onFullscreenEnter={() => showControls()}
              />

              <Pressable
                style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
                onPress={() => toggleControls()}
              >
                <View style={{ flex: 1, flexDirection: "row" }}>
                  <Pressable
                    style={{ flex: 1 }}
                    onLongPress={() => handleTap("left")}
                    onPress={() => handleTap("left")}
                  />
                  <View style={{ width: "20%" }} />
                  <Pressable
                    style={{ flex: 1 }}
                    onLongPress={() => handleTap("right")}
                    onPress={() => handleTap("right")}
                  />
                </View>
              </Pressable>
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
            onOpenSourcesDevices={
              currentStream.infoHash ? handleOpenSourcesDevices : undefined
            }
          />

          {controlsVisible && !activeCastDevice && (
            <PlayerOverlay
              currentStream={currentStream}
              engineType={engine?.getEngineType() ?? "Unknown"}
              stats={stats}
              onClose={handleClose}
              onSettings={() => setSettingsOpen(true)}
              onWebCast={() => setCastModalOpen(true)}
              onTogglePiP={handleTogglePiP}
              isPiPSupported={true}
            />
          )}

          <PlayerControls
            player={player}
            currentTime={player?.currentTime || 0}
            duration={player?.duration || 0}
            isVisible={controlsVisible && !activeCastDevice}
            isPlaying={player?.playing ?? false}
            onPlayPause={() => {
              if (player?.playing) player.pause();
              else player?.play();
            }}
          />
        </View>

        {showResumePrompt && (
          <ResumePrompt
            onResponse={handleResumeResponse}
            title={mediaInfo?.title || ""}
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
              if (id) engine?.setAudioTrack(id);
              if (engine) setAudioTracks(engine.getAudioTracks());
            }}
            onSelectSubtitle={(id: string | null) => {
              if (id) engine?.setSubtitle(id);
              if (engine) setSubtitles(engine.getSubtitles());
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
            onCastStart={(device: CastDevice) => {
              setActiveCastDevice(device);
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
    errorText: { color: colors.error, fontSize: 16, marginBottom: 16 },
    errorActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 10,
      maxWidth: 540,
      paddingHorizontal: 20,
    },
    errorButton: {
      backgroundColor: colors.tint + "15",
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      minWidth: 44,
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    errorButtonText: { color: colors.text, fontWeight: "600" },
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
      backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.8)",
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
      backgroundColor: isDark ? "rgba(20,20,35,0.6)" : "rgba(255,255,255,0.9)",
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
    resumeOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 50,
    },
    resumeBox: {
      backgroundColor: colors.card,
      padding: 30,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      maxWidth: 340,
    },
    resumeTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 8,
    },
    resumeSub: {
      color: colors.textSecondary,
      fontSize: 15,
      marginBottom: 24,
    },
    resumeBtns: {
      flexDirection: "row",
      gap: 12,
    },
    resumeBtnGhost: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    },
    resumeBtnGhostText: { color: colors.text, fontWeight: "600" },
    resumeBtnPrimary: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: colors.tint,
    },
    resumeBtnPrimaryText: {
      color: isDark ? "#000" : "#fff",
      fontWeight: "bold",
    },
  });
