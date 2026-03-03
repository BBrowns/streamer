import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
  FlatList,
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
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import {
  DesktopCastModal,
  type CastDevice,
} from "../components/DesktopCastModal";
import { useVideoPlayer, VideoView } from "expo-video";

// Add dynamically
let CastButton: any = null;
let useRemoteMediaClient: any = null;
let AirPlayButton: any = null;

if (Platform.OS !== "web") {
  try {
    const GoogleCast = require("react-native-google-cast");
    CastButton = GoogleCast.CastButton;
    useRemoteMediaClient = GoogleCast.useRemoteMediaClient;
  } catch { }
  try {
    const AirPlay = require("react-native-airplay-btn");
    AirPlayButton = AirPlay.AirPlayButton;
  } catch { }
}

const SEEK_SECONDS = 10;
const DOUBLE_TAP_DELAY = 300;
const PROGRESS_REPORT_INTERVAL = 15_000; // Report every 15 seconds

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
    setBuffering,
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

  // Double-tap seek state
  const [seekFeedback, setSeekFeedback] = useState<"left" | "right" | null>(
    null,
  );
  const lastTapRef = useRef<{ time: number; side: "left" | "right" } | null>(
    null,
  );
  const seekFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Progress reporting
  const updateProgress = useUpdateProgress();
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  const remoteMediaClient = useRemoteMediaClient
    ? useRemoteMediaClient()
    : null;
  const lastCastUriRef = useRef<string | null>(null);

  const engine = currentStream
    ? streamEngineManager.resolveEngine(currentStream)
    : null;
  const playbackUri = currentStream
    ? streamEngineManager.getPlaybackUri(currentStream)
    : null;

  // Initialize expo-video player
  const player = useVideoPlayer(playbackUri || "", (p) => {
    p.play();
  });

  // Cast Media
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

  // Subscribe to engine events
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

  // Subscribe to SSE metrics for torrent streams
  useEffect(() => {
    if (currentStream?.infoHash && streamState === "idle") {
      subscribeToStreamMetrics(currentStream.infoHash);
    }
  }, [currentStream?.infoHash, streamState, subscribeToStreamMetrics]);

  // Progress reporting to server (every 15s) and local state sync
  useEffect(() => {
    if (!mediaInfo) return;

    progressTimerRef.current = setInterval(() => {
      const currentTime = player?.currentTime || 0;
      const duration = player?.duration || 0;

      setProgress(currentTime, duration);

      if (currentTime > 0 && duration > 0) {
        updateProgress.mutate({
          type: mediaInfo.type,
          itemId: mediaInfo.itemId,
          title: mediaInfo.title,
          poster: mediaInfo.poster,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
          currentTime: currentTime,
          duration: duration,
        });
      }
    }, PROGRESS_REPORT_INTERVAL);

    return () => {
      // Report final progress on unmount
      const currentTime = player?.currentTime || 0;
      const duration = player?.duration || 0;

      if (currentTime > 0 && duration > 0) {
        updateProgress.mutate({
          type: mediaInfo.type,
          itemId: mediaInfo.itemId,
          title: mediaInfo.title,
          poster: mediaInfo.poster,
          season: mediaInfo.season,
          episode: mediaInfo.episode,
          currentTime: currentTime,
          duration: duration,
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

  const handleDoubleTap = useCallback(
    (side: "left" | "right") => {
      const now = Date.now();
      const lastTap = lastTapRef.current;

      if (
        lastTap &&
        now - lastTap.time < DOUBLE_TAP_DELAY &&
        lastTap.side === side
      ) {
        const currentTime = player?.currentTime || 0;
        const duration = player?.duration || 0;

        const seekTo =
          side === "right"
            ? Math.min(currentTime + SEEK_SECONDS, duration)
            : Math.max(currentTime - SEEK_SECONDS, 0);

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
      }
    },
    [player],
  );

  const handleSelectAudio = useCallback(
    (id: string) => {
      engine?.setAudioTrack(id);
      setAudioTracks(engine?.getAudioTracks() ?? []);
    },
    [engine],
  );

  const handleSelectSubtitle = useCallback(
    (id: string | null) => {
      engine?.setSubtitle(id);
      setSubtitles(engine?.getSubtitles() ?? []);
    },
    [engine],
  );

  if (!currentStream || !playbackUri) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <Text className="text-error text-base mb-4">No stream selected</Text>
        <Pressable
          className="bg-primary px-5 py-2.5 rounded-xl min-w-[44px] min-h-[44px] justify-center items-center"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-white font-semibold flex-row">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const headerBar = (
    <View className="flex-row justify-between items-center pt-[60px] px-4 pb-2 bg-black/80 z-20">
      <Pressable
        className="bg-white/10 px-4 py-2 rounded-full min-w-[44px] min-h-[44px] justify-center items-center"
        onPress={() => {
          clearPlayer();
          router.back();
        }}
        accessibilityRole="button"
        accessibilityLabel="Close player"
      >
        <Text className="text-textMain font-semibold text-sm">✕ Close</Text>
      </Pressable>
      <View className="flex-row items-center gap-3">
        {CastButton && Platform.OS !== "web" && (
          <CastButton style={{ width: 44, height: 44, tintColor: "#e0e0ff" }} />
        )}
        {AirPlayButton && Platform.OS === "ios" && (
          <AirPlayButton
            style={{ width: 44, height: 44, tintColor: "#e0e0ff" }}
          />
        )}
        {Platform.OS === "web" && (
          <Pressable
            className="bg-white/10 w-11 h-11 rounded-full justify-center items-center"
            onPress={() => setCastModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Cast to Device"
          >
            <MaterialIcons name="cast" size={20} color="#e0e0ff" />
          </Pressable>
        )}
        <Pressable
          className="bg-white/10 w-11 h-11 rounded-full justify-center items-center"
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Playback settings"
        >
          <Ionicons name="settings-sharp" size={20} color="#e0e0ff" />
        </Pressable>
      </View>
    </View>
  );

  const infoBar = (
    <View className="bg-[#0a0a1a]/95 px-4 py-3 pb-10 z-20">
      <Text className="text-textMain font-bold text-[15px]">
        🎬 {currentStream.title || currentStream.name || "Now Playing"}
      </Text>
      <View className="flex-row items-center gap-3 mt-1">
        <Text className="text-textMuted text-[11px]">
          Engine: {engine?.getEngineType().toUpperCase() ?? "Unknown"}
        </Text>
        {stats.peers > 0 ? (
          <Text className="text-primary text-[11px] font-semibold">
            ↓ {(stats.speed / 1024).toFixed(0)} KB/s · {stats.peers} peers
          </Text>
        ) : null}
      </View>
    </View>
  );

  // Double-tap seek overlay (shows ±10s feedback)
  const seekOverlay = seekFeedback && (
    <View
      className={`absolute top-[40%] px-5 py-2.5 bg-black/70 rounded-3xl z-20 ${seekFeedback === "left" ? "left-10" : "right-10"}`}
    >
      <Text className="text-textMain text-base font-bold">
        {seekFeedback === "left"
          ? `⏪ ${SEEK_SECONDS}s`
          : `${SEEK_SECONDS}s ⏩`}
      </Text>
    </View>
  );

  // Gesture zones for double-tap seek (left = rewind, right = forward)
  const gestureZones = Platform.OS !== "web" && (
    <View className="absolute inset-0 flex-row z-10" pointerEvents="box-none">
      <Pressable
        className="flex-1"
        onPress={() => handleDoubleTap("left")}
        accessibilityLabel="Double-tap to seek backward 10 seconds"
      />
      <Pressable
        className="flex-1"
        onPress={() => handleDoubleTap("right")}
        accessibilityLabel="Double-tap to seek forward 10 seconds"
      />
    </View>
  );

  const settingsModal = (
    <Modal
      visible={settingsOpen}
      animationType="slide"
      transparent
      onRequestClose={() => setSettingsOpen(false)}
    >
      <View className="flex-1 bg-black/70 justify-end z-50">
        <View className="bg-[#0d0d24] rounded-t-[20px] p-5 pb-10 max-h-[60%]">
          <View className="flex-row justify-between items-center mb-5">
            <Text className="text-textMain text-lg font-bold">
              ⚙️ Playback Settings
            </Text>
            <Pressable
              onPress={() => setSettingsOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Text className="text-primary font-bold text-[15px]">Done</Text>
            </Pressable>
          </View>

          {/* Audio Tracks */}
          <Text className="text-textMain text-sm font-bold mb-2">
            🔊 Audio Tracks
          </Text>
          {audioTracks.length === 0 ? (
            <Text className="text-textMuted text-xs italic">
              No selectable audio tracks — using default.
            </Text>
          ) : (
            <FlatList
              data={audioTracks}
              keyExtractor={(t) => t.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Pressable
                  className={`flex-row items-center py-2.5 px-3 rounded-lg mb-1 min-h-[44px] ${item.active ? "bg-primary/15" : ""}`}
                  onPress={() => handleSelectAudio(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Audio: ${item.label}${item.active ? ", selected" : ""}`}
                >
                  <Text className="text-textMain text-sm flex-1">
                    {item.label}
                  </Text>
                  <Text className="text-textMuted text-xs mr-2">
                    {item.language}
                  </Text>
                  {item.active && (
                    <Text className="text-primary font-bold text-base">✓</Text>
                  )}
                </Pressable>
              )}
            />
          )}

          {/* Subtitles */}
          <Text className="text-textMain text-sm font-bold mt-5 mb-2">
            💬 Subtitles
          </Text>
          {subtitles.length === 0 ? (
            <Text className="text-textMuted text-xs italic">
              No subtitle tracks available.
            </Text>
          ) : (
            <>
              <Pressable
                className={`flex-row items-center py-2.5 px-3 rounded-lg mb-1 min-h-[44px] ${subtitles.every((s) => !s.active) ? "bg-primary/15" : ""}`}
                onPress={() => handleSelectSubtitle(null)}
                accessibilityRole="button"
                accessibilityLabel="Subtitles off"
              >
                <Text className="text-textMain text-sm flex-1">Off</Text>
              </Pressable>
              <FlatList
                data={subtitles}
                keyExtractor={(t) => t.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    className={`flex-row items-center py-2.5 px-3 rounded-lg mb-1 min-h-[44px] ${item.active ? "bg-primary/15" : ""}`}
                    onPress={() => handleSelectSubtitle(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Subtitle: ${item.label}${item.active ? ", selected" : ""}`}
                  >
                    <Text className="text-textMain text-sm flex-1">
                      {item.label}
                    </Text>
                    <Text className="text-textMuted text-xs mr-2">
                      {item.language}
                    </Text>
                    {item.active && (
                      <Text className="text-primary font-bold text-base">
                        ✓
                      </Text>
                    )}
                  </Pressable>
                )}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  // Web fallback using HTML5 video
  if (Platform.OS === "web") {
    return (
      <View className="flex-1 bg-black">
        {headerBar}
        <View className="flex-1 justify-center items-center bg-black">
          {activeCastDevice ? (
            <View className="flex-1 w-full justify-center items-center bg-[#050510]">
              {mediaInfo?.poster && (
                <Image
                  className="absolute inset-0 opacity-30 blur-xl"
                  source={{ uri: mediaInfo.poster }}
                  resizeMode="cover"
                />
              )}
              <View className="items-center bg-[#141423]/60 p-10 rounded-[32px] border border-white/10 shadow-2xl backdrop-blur-3xl">
                <View className="bg-primary/15 p-6 rounded-[40px] mb-6 shadow shadow-primary/40">
                  <MaterialIcons
                    name="cast-connected"
                    size={56}
                    color="#818cf8"
                  />
                </View>
                <Text className="text-white text-[22px] font-bold mb-2">
                  Casting to {activeCastDevice.name}
                </Text>
                <Text className="text-textMuted text-base mb-8 text-center max-w-[300px]">
                  {currentStream.title || currentStream.name}
                </Text>

                <Pressable
                  className="flex-row items-center gap-2 bg-error/10 px-7 py-3.5 rounded-full border border-error/30 active:bg-error/20 active:border-error/50 active:scale-95 transition-all"
                  onPress={stopCasting}
                >
                  <View className="flex-row items-center gap-2">
                    <MaterialIcons name="cancel" size={18} color="#fca5a5" />
                    <Text className="text-[#fef2f2] font-semibold text-[15px] tracking-wide">
                      Stop Casting
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          ) : (
            /* @ts-ignore — RNW doesn't know about video tag */
            <video
              src={playbackUri}
              controls
              autoPlay
              style={{ width: "100%", height: "100%", backgroundColor: "#000" }}
            />
          )}
        </View>
        {infoBar}
        {settingsModal}
        <DesktopCastModal
          visible={castModalOpen}
          playbackUri={playbackUri}
          title={currentStream.title || currentStream.name || "Video"}
          onClose={() => setCastModalOpen(false)}
          onCastStart={(device) => setActiveCastDevice(device)}
        />
      </View>
    );
  }

  // Native player using expo-video
  return (
    <View className="flex-1 bg-black">
      {headerBar}

      <View className="flex-1 justify-center items-center bg-black overflow-hidden relative">
        {streamState === "loading_metrics" && (
          <View className="absolute inset-0 justify-center items-center z-10 p-6 bg-black/80">
            <ActivityIndicator size="large" color="#818cf8" className="mb-4" />
            <Text className="text-white text-lg font-bold">
              {streamMetrics?.state === 'finding_peers' ? 'Finding peers...' :
                streamMetrics?.state === 'connecting' ? 'Connecting to peers...' :
                  'Buffering...'}
            </Text>
            {streamMetrics && (
              <Text className="text-textMuted mt-2 text-sm">
                {streamMetrics.numPeers} peers • {(streamMetrics.downloadSpeed / 1024 / 1024).toFixed(2)} MB/s
              </Text>
            )}
          </View>
        )}
        {streamState === "error" && (
          <View className="absolute inset-0 justify-center items-center z-10 p-6 bg-black/95">
            <MaterialIcons name="error-outline" size={48} color="#fca5a5" className="mb-4" />
            <Text className="text-error text-lg font-bold text-center mb-2">Connection Failed</Text>
            <Text className="text-textMuted text-center max-w-[280px] mb-6">
              {errorMessage || "Unable to load stream"}
            </Text>
            <Pressable
              className="bg-white/10 px-6 py-3 rounded-xl border border-white/20"
              onPress={() => router.back()}
            >
              <Text className="text-white font-semibold">Go Back</Text>
            </Pressable>
          </View>
        )}
        {isBuffering && streamState !== "loading_metrics" && streamState !== "error" && (
          <View className="absolute inset-0 justify-center items-center z-10 pointer-events-none">
            <ActivityIndicator size="large" color="#818cf8" />
          </View>
        )}
        {seekOverlay}
        {gestureZones}
        {player && (
          <VideoView
            player={player}
            style={{ width: "100%", height: "100%" }}
            nativeControls={true}
            allowsFullscreen={true}
            showsTimecodes={true}
          />
        )}
      </View>

      {infoBar}
      {settingsModal}
    </View>
  );
}
