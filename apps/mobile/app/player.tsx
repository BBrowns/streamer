import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { usePlayerStore } from "../stores/playerStore";
import { api } from "../services/api";
import { streamEngineManager } from "../services/streamEngine/StreamEngineManager";
import {
  useUpdateProgress,
  useContinueWatching,
} from "../hooks/useContinueWatching";
import { useTraktScrobbler } from "../hooks/useTraktScrobbler";
import { useMeta } from "../hooks/useMeta";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type {
  AudioTrack,
  SubtitleTrack,
  StreamStats,
} from "../services/streamEngine/IStreamEngine";
import { MaterialIcons } from "@expo/vector-icons";
import {
  DesktopCastModal,
  type CastDevice,
} from "../components/DesktopCastModal";
import { useVideoPlayer, VideoView } from "expo-video";
import type { VideoViewProps } from "expo-video";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useRemoteMediaClient } from "../components/player/castModules";
import { PlayerOverlay } from "../components/player/PlayerOverlay";
import { PlayerSettingsModal } from "../components/player/PlayerSettingsModal";
import { PlayerStatusOverlay } from "../components/player/PlayerStatusOverlay";
import { PlayerControls } from "../components/player/PlayerControls";
import { NextEpisodeOverlay } from "../components/player/NextEpisodeOverlay";
import { useRemoteControl } from "../hooks/useRemoteControl";
import { DeviceEventEmitter } from "react-native";

const SEEK_SECONDS = 10;
const DOUBLE_TAP_DELAY = 300;
const PROGRESS_REPORT_INTERVAL = 15_000;

export default function PlayerScreen() {
  const router = useRouter();
  const {
    currentStream,
    mediaInfo,
    isBuffering,
    streamState,
    streamMetrics,
    errorMessage,
    subscribeToStreamMetrics,
    setProgress,
    clearPlayer,
    playbackRate,
    setPlaybackRate,
    autoPlayNext,
    setStream,
  } = usePlayerStore();

  const { updateStatus } = useRemoteControl();
  useTraktScrobbler();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [stats, setStats] = useState<StreamStats>({ speed: 0, peers: 0 });
  const [castModalOpen, setCastModalOpen] = useState(false);
  const [activeCastDevice, setActiveCastDevice] = useState<CastDevice | null>(
    null,
  );

  const [seekFeedback, setSeekFeedback] = useState<"left" | "right" | null>(
    null,
  );
  const lastTapRef = useRef<{ time: number; side: "left" | "right" } | null>(
    null,
  );
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateProgress = useUpdateProgress();
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoViewRef = useRef<any>(null);

  const remoteMediaClient = useRemoteMediaClient
    ? (useRemoteMediaClient() as any)
    : null;
  const lastCastUriRef = useRef<string | null>(null);

  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 4000);
  }, []);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      setControlsVisible(false);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    } else {
      showControls();
    }
  }, [controlsVisible, showControls]);

  // Brightness and Volume states (mocking brightness visually via overlay)
  const [fakeBrightness, setFakeBrightness] = useState(1.0);
  const [showBrightnessFeedback, setShowBrightnessFeedback] = useState(false);
  const [showVolumeFeedback, setShowVolumeFeedback] = useState(false);

  const [showNextEpisodeOverlay, setShowNextEpisodeOverlay] = useState(false);

  const { data: meta } = useMeta(
    mediaInfo?.type || "",
    mediaInfo?.itemId || "",
  );

  const nextEpisode = useMemo(() => {
    if (!meta || !mediaInfo || mediaInfo.type !== "series") return null;
    const currentIndex = meta.videos?.findIndex(
      (v) => v.season === mediaInfo.season && v.episode === mediaInfo.episode,
    );
    if (currentIndex === undefined || currentIndex === -1) return null;
    return meta.videos?.[currentIndex + 1] || null;
  }, [meta, mediaInfo]);

  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const engine = currentStream
    ? streamEngineManager.resolveEngine(currentStream)
    : null;

  const { data: cwItems } = useContinueWatching();
  const previousProgress = useMemo(() => {
    if (!mediaInfo || !cwItems) return null;
    return cwItems.find(
      (p) =>
        p.itemId === mediaInfo.itemId &&
        p.type === mediaInfo.type &&
        p.season === mediaInfo.season &&
        p.episode === mediaInfo.episode,
    );
  }, [mediaInfo, cwItems]);

  const [hasPromptedResume, setHasPromptedResume] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (currentStream) {
      streamEngineManager.getPlaybackUri(currentStream).then((uri) => {
        if (isMounted) setPlaybackUri(uri);
      });
    } else {
      setPlaybackUri(null);
    }
    return () => {
      isMounted = false;
    };
  }, [currentStream]);

  const player = useVideoPlayer(playbackUri || "", (p) => {
    p.play();
  });

  useEffect(() => {
    if (player && player.playbackRate !== playbackRate) {
      player.playbackRate = playbackRate;
    }
  }, [player, playbackRate]);

  useEffect(() => {
    if (
      player &&
      previousProgress &&
      previousProgress.currentTime > 15 &&
      !hasPromptedResume
    ) {
      setHasPromptedResume(true);
      setShowResumePrompt(true);
      if (player.playing) player.pause();
    }
  }, [player, previousProgress, hasPromptedResume]);

  const handleResume = (yes: boolean) => {
    setShowResumePrompt(false);
    if (yes && previousProgress && player) {
      player.currentTime = previousProgress.currentTime;
    }
    player?.play();
  };

  useEffect(() => {
    if (!remoteMediaClient || !playbackUri || !currentStream) return;
    if (lastCastUriRef.current !== playbackUri) {
      lastCastUriRef.current = playbackUri;
      remoteMediaClient
        .loadMedia({
          mediaInfo: {
            contentUrl: playbackUri,
            contentType: playbackUri.includes(".m3u8")
              ? "application/x-mpegurl"
              : "video/mp4",
            metadata: {
              type: "movie",
              title: currentStream.title || currentStream.name || "Video",
            },
          },
        })
        .catch(console.error);
    }
  }, [remoteMediaClient, playbackUri, currentStream]);

  useEffect(() => {
    if (!engine) return;
    setAudioTracks(engine.getAudioTracks());
    setSubtitles(engine.getSubtitles());
    const onStats = (data: StreamStats) => setStats(data);
    engine.on("stats", onStats);
    return () => {
      engine.off("stats", onStats);
      engine.stop?.();
    };
  }, [engine]);

  useEffect(() => {
    if (currentStream?.infoHash) {
      subscribeToStreamMetrics(currentStream.infoHash);
    }
  }, [currentStream?.infoHash, subscribeToStreamMetrics]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input (e.g. search)
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          if (player?.playing) player.pause();
          else player?.play();
          showControls();
          break;
        case "f":
          e.preventDefault();
          // Fullscreen logic for web
          const videoElement = document.querySelector("video");
          if (videoElement) {
            if (!document.fullscreenElement) {
              videoElement.requestFullscreen().catch(console.error);
            } else {
              document.exitFullscreen().catch(console.error);
            }
          }
          break;
        case "m":
          e.preventDefault();
          if (player) {
            player.muted = !player.muted;
            showControls();
          }
          break;
        case "arrowleft":
        case "j":
          e.preventDefault();
          player?.seekBy(-SEEK_SECONDS);
          setSeekFeedback("left");
          if (seekFeedbackTimer.current)
            clearTimeout(seekFeedbackTimer.current);
          seekFeedbackTimer.current = setTimeout(
            () => setSeekFeedback(null),
            600,
          );
          showControls();
          break;
        case "arrowright":
        case "l":
          e.preventDefault();
          player?.seekBy(SEEK_SECONDS);
          setSeekFeedback("right");
          if (seekFeedbackTimer.current)
            clearTimeout(seekFeedbackTimer.current);
          seekFeedbackTimer.current = setTimeout(
            () => setSeekFeedback(null),
            600,
          );
          showControls();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [player, showControls]);

  useEffect(() => {
    if (!mediaInfo || !player) return;

    progressTimerRef.current = setInterval(() => {
      let currentTime = 0;
      let duration = 0;
      try {
        currentTime = player.currentTime || 0;
        duration = player.duration || 0;
      } catch (e) {
        return;
      }

      setProgress(currentTime, duration);

      if (currentTime > 0 && duration > 0) {
        updateProgress.mutate({
          itemId: mediaInfo.itemId,
          type: mediaInfo.type,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
          currentTime,
          duration,
          title: mediaInfo.title,
          poster: mediaInfo.poster,
        });

        // Auto-play next episode trigger (30s before end)
        if (
          autoPlayNext &&
          nextEpisode &&
          !showNextEpisodeOverlay &&
          duration - currentTime < 30 &&
          duration > 60
        ) {
          setShowNextEpisodeOverlay(true);
        }
      }
    }, PROGRESS_REPORT_INTERVAL);

    // Periodically update playback session for Remote Control discovery
    const sessionTimer = setInterval(() => {
      if (!player) return;
      updateStatus({
        status: player.playing ? "playing" : "paused",
        itemId: mediaInfo.itemId,
        itemTitle: mediaInfo.title,
        position: player.currentTime,
        duration: player.duration,
      });
    }, 5000); // More frequent session updates for smoother remote progress

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      clearInterval(sessionTimer);
      // Mark session as idle on unmount
      updateStatus({ status: "idle" });
    };
  }, [
    mediaInfo,
    player,
    setProgress,
    updateProgress,
    updateStatus,
    autoPlayNext,
    nextEpisode,
    showNextEpisodeOverlay,
  ]);

  const handleClose = useCallback(() => {
    router.back();
    setTimeout(() => clearPlayer(), 100);
  }, [router, clearPlayer]);

  // Handle remote commands
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("REMOTE_COMMAND", (cmd) => {
      if (!player) return;
      console.log("[Player] Received remote command:", cmd);

      switch (cmd.action) {
        case "play":
          player.play();
          showControls();
          break;
        case "pause":
          player.pause();
          showControls();
          break;
        case "seek":
          if (cmd.data?.position !== undefined) {
            player.currentTime = cmd.data.position;
          }
          break;
        case "stop":
          handleClose();
          break;
      }
    });

    return () => sub.remove();
  }, [player, handleClose, showControls]);

  const handleNextEpisode = useCallback(async () => {
    if (!nextEpisode || !mediaInfo) return;

    try {
      const episodeId = `${mediaInfo.itemId}:${nextEpisode.season}:${nextEpisode.episode}`;
      const { data } = await api.get(`/api/stream/series/${episodeId}`);
      if (data.streams && data.streams.length > 0) {
        setStream(data.streams[0], {
          ...mediaInfo,
          season: nextEpisode.season,
          episode: nextEpisode.episode,
          title: `${mediaInfo.title} - ${nextEpisode.title}`,
        });
        setHasPromptedResume(false);
        setShowNextEpisodeOverlay(false);
        setPlaybackUri(null); // Reset to trigger loading new URI
      }
    } catch (e) {
      console.error("Failed to auto-play next episode", e);
    }
  }, [nextEpisode, mediaInfo, setStream]);

  const stopCasting = async () => {
    if (!activeCastDevice) return;
    try {
      await fetch("http://localhost:11470/api/cast/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: activeCastDevice.id, action: "stop" }),
      });
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
        // Double tap confirmed
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
        // Single tap candidate
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
        if (videoElement && (videoElement as any).requestPictureInPicture) {
          (videoElement as any).requestPictureInPicture().catch(console.error);
        }
      } else {
        videoViewRef.current?.startPictureInPicture?.() ||
          videoViewRef.current?.enterPictureInPicture?.();
      }
    } catch (e) {
      console.warn("PiP not supported or failed", e);
    }
  }, []);

  if (!currentStream || !playbackUri) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No stream selected</Text>
        <Pressable style={styles.errorButton} onPress={handleClose}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Web fallback
  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
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
                  <MaterialIcons
                    name="cast-connected"
                    size={56}
                    color="#818cf8"
                  />
                </View>
                <Text style={styles.castTitle}>
                  Casting to {activeCastDevice.name}
                </Text>
                <Text style={styles.castSubtitle}>
                  {currentStream.title || currentStream.name}
                </Text>
                <Pressable style={styles.stopCastBtn} onPress={stopCasting}>
                  <MaterialIcons name="cancel" size={18} color="#fca5a5" />
                  <Text style={styles.stopCastText}>Stop Casting</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <PlayerStatusOverlay
                streamState={streamState}
                streamMetrics={streamMetrics}
                isBuffering={isBuffering}
                errorMessage={errorMessage}
                onBack={handleClose}
              />
              {/* @ts-ignore */}
              <video
                src={playbackUri}
                controls
                autoPlay
                style={styles.webVideo}
              />
            </>
          )}
        </View>

        <PlayerSettingsModal
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          audioTracks={audioTracks}
          subtitles={subtitles}
          onSelectAudio={(id) => {
            engine?.setAudioTrack(id);
            setAudioTracks(engine?.getAudioTracks() ?? []);
          }}
          onSelectSubtitle={(id) => {
            engine?.setSubtitle(id);
            setSubtitles(engine?.getSubtitles() ?? []);
          }}
          playbackRate={playbackRate}
          onSelectPlaybackRate={setPlaybackRate}
        />
        <DesktopCastModal
          visible={castModalOpen}
          playbackUri={playbackUri}
          title={currentStream.title || currentStream.name || "Video"}
          onClose={() => setCastModalOpen(false)}
          onCastStart={setActiveCastDevice}
        />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        {controlsVisible && (
          <PlayerOverlay
            currentStream={currentStream}
            engineType={engine?.getEngineType() ?? "Unknown"}
            stats={stats}
            onClose={handleClose}
            onSettings={() => setSettingsOpen(true)}
            onTogglePiP={handleTogglePiP}
            isPiPSupported={true}
          />
        )}

        <View style={styles.videoContainer}>
          {seekFeedback && (
            <View
              style={[
                styles.seekOverlay,
                seekFeedback === "left" ? { left: 40 } : { right: 40 },
              ]}
            >
              <Text style={styles.seekText}>
                {seekFeedback === "left"
                  ? `⏪ ${SEEK_SECONDS}s`
                  : `${SEEK_SECONDS}s ⏩`}
              </Text>
            </View>
          )}

          {showResumePrompt && (
            <View style={styles.resumeOverlay}>
              <View style={styles.resumeBox}>
                <Text style={styles.resumeTitle}>Resume Playback?</Text>
                <Text style={styles.resumeSub}>
                  You left off at{" "}
                  {Math.floor((previousProgress?.currentTime || 0) / 60)}:
                  {String(
                    Math.floor((previousProgress?.currentTime || 0) % 60),
                  ).padStart(2, "0")}
                </Text>
                <View style={styles.resumeBtns}>
                  <Pressable
                    style={styles.resumeBtnGhost}
                    onPress={() => handleResume(false)}
                  >
                    <Text style={styles.resumeBtnGhostText}>Start Over</Text>
                  </Pressable>
                  <Pressable
                    style={styles.resumeBtnPrimary}
                    onPress={() => handleResume(true)}
                  >
                    <Text style={styles.resumeBtnPrimaryText}>Resume</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {showBrightnessFeedback && (
            <View style={styles.feedbackOverlay}>
              <Text style={styles.feedbackText}>
                ☀️ Brightness: {Math.round(fakeBrightness * 100)}%
              </Text>
            </View>
          )}

          {showVolumeFeedback && player && (
            <View style={styles.feedbackOverlay}>
              <Text style={styles.feedbackText}>
                🔊 Volume: {Math.round(player.volume * 100)}%
              </Text>
            </View>
          )}

          {streamState !== "error" && streamState !== "loading_metrics" && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View style={{ flex: 1, flexDirection: "row" }}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => handleTap("left")}
                />
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => handleTap("right")}
                />
              </View>
            </View>
          )}

          {player && (
            <VideoView
              ref={videoViewRef}
              player={player}
              style={{ width: "100%", height: "100%" }}
              nativeControls={false}
              contentFit="contain"
              allowsPictureInPicture
            />
          )}

          <PlayerStatusOverlay
            streamState={streamState}
            streamMetrics={streamMetrics}
            isBuffering={isBuffering}
            errorMessage={errorMessage}
            onBack={handleClose}
          />

          <PlayerControls
            player={player}
            currentTime={player?.currentTime || 0}
            duration={player?.duration || 0}
            isVisible={controlsVisible}
            isPlaying={player?.playing ?? false}
            onPlayPause={() => {
              if (player?.playing) player.pause();
              else player?.play();
            }}
          />
        </View>

        {/* Fake Brightness Filter */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: `rgba(0,0,0,${1.0 - fakeBrightness})`,
              pointerEvents: "none",
            },
          ]}
        />

        <PlayerSettingsModal
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          audioTracks={audioTracks}
          subtitles={subtitles}
          onSelectAudio={(id) => {
            engine?.setAudioTrack(id);
            setAudioTracks(engine?.getAudioTracks() ?? []);
          }}
          onSelectSubtitle={(id) => {
            engine?.setSubtitle(id);
            setSubtitles(engine?.getSubtitles() ?? []);
          }}
          playbackRate={playbackRate}
          onSelectPlaybackRate={setPlaybackRate}
        />

        {showResumePrompt && previousProgress && (
          <View style={styles.resumeOverlay}>
            <View style={styles.resumeBox}>
              <Text style={styles.resumeTitle}>Resume Playback?</Text>
              <Text style={styles.resumeSub}>
                Continue from {Math.floor(previousProgress.currentTime / 60)}:
                {String(Math.floor(previousProgress.currentTime % 60)).padStart(
                  2,
                  "0",
                )}
              </Text>
              <View style={styles.resumeBtns}>
                <Pressable
                  style={styles.resumeBtnGhost}
                  onPress={() => handleResume(false)}
                >
                  <Text style={styles.resumeBtnGhostText}>Start Over</Text>
                </Pressable>
                <Pressable
                  style={styles.resumeBtnPrimary}
                  onPress={() => handleResume(true)}
                >
                  <Text style={styles.resumeBtnPrimaryText}>Resume</Text>
                </Pressable>
              </View>
            </View>
          </View>
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
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  errorContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: { color: "#fca5a5", fontSize: 16, marginBottom: 16 },
  errorButton: {
    backgroundColor: "#e50914",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  errorButtonText: { color: "#fff", fontWeight: "600" },
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
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 24,
    zIndex: 20,
  },
  seekText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  feedbackOverlay: {
    position: "absolute",
    top: 40,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 20,
    zIndex: 20,
  },
  feedbackText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  castContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#050510",
  },
  castBg: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.3,
  },
  castCard: {
    alignItems: "center",
    backgroundColor: "rgba(20,20,35,0.6)",
    padding: 40,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  castIconWrap: {
    backgroundColor: "rgba(129,140,248,0.15)",
    padding: 24,
    borderRadius: 40,
    marginBottom: 24,
  },
  castTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  castSubtitle: {
    color: "#a1a1aa",
    fontSize: 16,
    marginBottom: 32,
    textAlign: "center",
    maxWidth: 300,
  },
  stopCastBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(252,165,165,0.1)",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(252,165,165,0.3)",
  },
  stopCastText: { color: "#fef2f2", fontWeight: "600", fontSize: 15 },
  resumeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  resumeBox: {
    backgroundColor: "#1a1a24",
    padding: 30,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    maxWidth: 340,
  },
  resumeTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  resumeSub: {
    color: "#a1a1aa",
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
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  resumeBtnGhostText: { color: "#fff", fontWeight: "600" },
  resumeBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#00f2ff",
  },
  resumeBtnPrimaryText: { color: "#000", fontWeight: "bold" },
});
