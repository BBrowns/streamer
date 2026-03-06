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
import { streamEngineManager } from "../services/streamEngine/StreamEngineManager";
import { useUpdateProgress } from "../hooks/useContinueWatching";
import { useEffect, useRef, useState, useCallback } from "react";
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
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useRemoteMediaClient } from "../components/player/castModules";
import { PlayerOverlay } from "../components/player/PlayerOverlay";
import { PlayerSettingsModal } from "../components/player/PlayerSettingsModal";
import { PlayerStatusOverlay } from "../components/player/PlayerStatusOverlay";
import { PlayerControls } from "../components/player/PlayerControls";

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
  } = usePlayerStore();

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

  const [playbackUri, setPlaybackUri] = useState<string | null>(null);
  const engine = currentStream
    ? streamEngineManager.resolveEngine(currentStream)
    : null;

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
    if (!mediaInfo) return;
    progressTimerRef.current = setInterval(() => {
      let currentTime = 0;
      let duration = 0;
      try {
        currentTime = player?.currentTime || 0;
        duration = player?.duration || 0;
      } catch {
        return;
      }

      setProgress(currentTime, duration);

      if (currentTime > 0 && duration > 0) {
        updateProgress.mutate({
          type: mediaInfo.type,
          itemId: mediaInfo.itemId,
          title: mediaInfo.title,
          poster: mediaInfo.poster,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
          currentTime,
          duration,
        });
      }
    }, PROGRESS_REPORT_INTERVAL);

    return () => {
      let currentTime = 0,
        duration = 0;
      try {
        currentTime = player?.currentTime || 0;
        duration = player?.duration || 0;
      } catch {}
      if (currentTime > 0 && duration > 0) {
        updateProgress.mutate({
          type: mediaInfo.type,
          itemId: mediaInfo.itemId,
          title: mediaInfo.title,
          poster: mediaInfo.poster,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
          currentTime,
          duration,
        });
      }
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [mediaInfo, player]);

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

  const handleClose = useCallback(() => {
    router.back();
    setTimeout(() => clearPlayer(), 100);
  }, [router, clearPlayer]);

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
              player={player}
              style={{ width: "100%", height: "100%" }}
              nativeControls={false}
              contentFit="contain"
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
        />
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
});
