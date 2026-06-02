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
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";

import { useTheme } from "../hooks/useTheme";
import { usePlayerStore } from "../stores/playerStore";
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
  const fallbackReason = usePlayerStore((s) => s.fallbackReason);
  const clearPlayer = usePlayerStore((s) => s.clearPlayer);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setBuffering = usePlayerStore((s) => s.setBuffering);
  const setStreamStatus = usePlayerStore((s) => s.setStreamStatus);
  const advanceToNextFallback = usePlayerStore((s) => s.advanceToNextFallback);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [activeCastDevice, setActiveCastDevice] = useState<CastDevice | null>(
    null,
  );
  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const [isResolvingPlayback, setIsResolvingPlayback] = useState(false);
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
    goBackOrReplace(router);
    setTimeout(() => clearPlayer(), 100);
  }, [router, clearPlayer]);

  const handleOpenSourcesDevices = useCallback(() => {
    clearPlayer();
    router.replace("/settings");
  }, [clearPlayer, router]);

  const handleRetryPlayback = useCallback(async () => {
    if (!currentStream) return;
    setPlaybackUri(null);
    setIsResolvingPlayback(true);
    setStreamStatus("loading_metrics");
    if (currentStream.infoHash) {
      await streamEngineManager.detectBridge();
    }
    setResolveAttempt((attempt) => attempt + 1);
  }, [currentStream, setStreamStatus]);

  const tryAdvanceToFallback = useCallback(
    (reason?: string | null) => {
      const nextStream = advanceToNextFallback(reason);
      if (!nextStream) return false;

      setPlaybackUri(null);
      setIsResolvingPlayback(true);
      setResolveAttempt((attempt) => attempt + 1);
      return true;
    },
    [advanceToNextFallback],
  );

  // Effect to resolve playback URI
  useEffect(() => {
    let isMounted = true;
    let advancedToFallback = false;
    if (currentStream) {
      const unsupportedCodecReason =
        getUnsupportedWebCodecReason(currentStream);
      if (unsupportedCodecReason) {
        const message = t("player.errors.unsupportedCodec");
        if (tryAdvanceToFallback(message)) {
          advancedToFallback = true;
          return () => {
            isMounted = false;
          };
        }
        setPlaybackUri(null);
        setIsResolvingPlayback(false);
        setStreamStatus("error", message);
        return () => {
          isMounted = false;
        };
      }

      setIsResolvingPlayback(true);
      setStreamStatus("loading_metrics");
      streamEngineManager
        .getPlaybackUri(currentStream)
        .then((uri) => {
          if (!isMounted) return;

          if (uri && uri.length > 0) {
            setPlaybackUri(uri);
            return;
          }

          const message = currentStream.infoHash
            ? t("player.errors.bridgeUnavailable")
            : t("player.errors.noStream");
          if (tryAdvanceToFallback(message)) {
            advancedToFallback = true;
            return;
          }

          setPlaybackUri(null);
          setStreamStatus("error", message);
        })
        .catch((err) => {
          if (!isMounted) return;
          const message = err?.message || t("player.errors.playbackFailed");
          if (tryAdvanceToFallback(message)) {
            advancedToFallback = true;
            return;
          }

          setPlaybackUri(null);
          setStreamStatus("error", message);
        })
        .finally(() => {
          if (isMounted && !advancedToFallback) setIsResolvingPlayback(false);
        });
    } else {
      setPlaybackUri(null);
      setIsResolvingPlayback(false);
    }
    return () => {
      isMounted = false;
    };
  }, [currentStream, resolveAttempt, setStreamStatus, t, tryAdvanceToFallback]);

  const player = useVideoPlayer(playbackUri || "", (p) => {
    p.play();
  });

  useEffect(() => {
    if (!player || !playbackUri || !currentStream) return;

    player.timeUpdateEventInterval = 1;
    setBuffering(true);

    const markLoading = () => {
      const state = usePlayerStore.getState();
      if (state.streamState === "playing") {
        setBuffering(true);
      } else if (state.streamState !== "error") {
        setStreamStatus("loading_metrics");
      }
    };

    const markPlaying = () => {
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
          if (tryAdvanceToFallback(message)) return;

          setBuffering(false);
          setPlaying(false);
          setStreamStatus("error", message);
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
      if (tryAdvanceToFallback(message)) return;

      setBuffering(false);
      setPlaying(false);
      setStreamStatus("error", message);
    }, PLAYBACK_START_TIMEOUT_MS);

    return () => {
      statusSub.remove();
      playingSub.remove();
      timeSub.remove();
      sourceSub.remove();
      clearTimeout(watchdog);
    };
  }, [
    currentStream,
    playbackUri,
    player,
    setBuffering,
    setPlaying,
    setStreamStatus,
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

  if (currentStream && isResolvingPlayback && !playbackUri) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.tint} />
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>
          {fallbackReason || "Preparing stream..."}
        </Text>
      </View>
    );
  }

  if (!currentStream || !playbackUri) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="light" />
        <Text style={styles.errorText}>
          {currentStream
            ? errorMessage || t("player.errors.playbackFailed")
            : t("player.errors.noStream")}
        </Text>
        <View style={styles.errorActions}>
          {!!currentStream && (
            <Pressable
              style={styles.errorPrimaryButton}
              onPress={handleRetryPlayback}
            >
              <Text
                style={[
                  styles.errorPrimaryButtonText,
                  { color: isDark ? "#000" : "#fff" },
                ]}
              >
                {t("common.retry")}
              </Text>
            </Pressable>
          )}
          {!!currentStream?.infoHash && (
            <Pressable
              style={styles.errorButton}
              onPress={handleOpenSourcesDevices}
            >
              <Text style={styles.errorButtonText}>
                {t("player.errors.openSourcesDevices")}
              </Text>
            </Pressable>
          )}
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
            streamMetrics={streamMetrics}
            isBuffering={isBuffering}
            errorMessage={errorMessage}
            fallbackReason={fallbackReason}
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
    errorPrimaryButton: {
      backgroundColor: colors.tint,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      minWidth: 44,
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    errorPrimaryButtonText: {
      color: "#fff",
      fontWeight: "800",
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
