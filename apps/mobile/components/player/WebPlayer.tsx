import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { PlayerStatusOverlay } from "./PlayerStatusOverlay";
import { PlayerSettingsModal } from "./PlayerSettingsModal";
import {
  DesktopCastModal,
  type CastDevice,
} from "../../components/DesktopCastModal";
import type { Stream } from "@streamer/shared";
import type {
  MediaInfo,
  StreamLoadState,
  StreamMetrics,
} from "../../stores/playerStore";
import type {
  AudioTrack,
  SubtitleTrack,
  StreamStats,
  IStreamEngine,
} from "../../services/streamEngine/IStreamEngine";

interface WebPlayerProps {
  playbackUri: string;
  currentStream: Stream;
  mediaInfo: MediaInfo | null;
  engine: IStreamEngine | null;
  stats: StreamStats;
  streamState: StreamLoadState;
  streamMetrics: StreamMetrics | null;
  isBuffering: boolean;
  errorMessage: string | null;
  audioTracks: AudioTrack[];
  subtitles: SubtitleTrack[];
  settingsOpen: boolean;
  castModalOpen: boolean;
  activeCastDevice: CastDevice | null;
  onClose: () => void;
  onSettings: () => void;
  onSettingsClose: () => void;
  onWebCast: () => void;
  onCastClose: () => void;
  onCastStart: (device: CastDevice) => void;
  onStopCasting: () => void;
  onSelectAudio: (id: string) => void;
  onSelectSubtitle: (id: string | null) => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WebPlayer({
  playbackUri,
  currentStream,
  mediaInfo,
  engine,
  stats,
  streamState,
  streamMetrics,
  isBuffering,
  errorMessage,
  audioTracks,
  subtitles,
  settingsOpen,
  castModalOpen,
  activeCastDevice,
  onClose,
  onSettings,
  onSettingsClose,
  onWebCast,
  onCastClose,
  onCastStart,
  onStopCasting,
  onSelectAudio,
  onSelectSubtitle,
}: WebPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoLoading, setVideoLoading] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls after 4s of inactivity
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) setControlsVisible(false);
    }, 4000);
  }, [isPlaying]);

  // Sync video element events → React state
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(v.currentTime);
    const onDur = () => setDuration(v.duration);
    const onWaiting = () => setVideoLoading(true);
    const onCanPlay = () => setVideoLoading(false);

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onCanPlay);

    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onCanPlay);
    };
  }, [playbackUri]);

  // Track fullscreen changes
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Mouse move → show controls
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = () => showControls();
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [showControls]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  const seek = (time: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(time, v.duration || 0));
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  // Cast view
  if (activeCastDevice) {
    return (
      <View style={styles.container}>
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
              <MaterialIcons name="cast-connected" size={56} color="#818cf8" />
            </View>
            <Text style={styles.castTitle}>
              Casting to {activeCastDevice.name}
            </Text>
            <Text style={styles.castSubtitle}>
              {currentStream.title || currentStream.name}
            </Text>
            <Pressable style={styles.stopCastBtn} onPress={onStopCasting}>
              <MaterialIcons name="cancel" size={18} color="#fca5a5" />
              <Text style={styles.stopCastText}>Stop Casting</Text>
            </Pressable>
          </View>
        </View>
        <DesktopCastModal
          visible={castModalOpen}
          playbackUri={playbackUri}
          title={currentStream.title || currentStream.name || "Video"}
          onClose={onCastClose}
          onCastStart={onCastStart}
        />
      </View>
    );
  }

  return (
    // @ts-ignore — using raw div for proper mouse event and fullscreen support
    <div ref={containerRef} style={divStyles.container}>
      {/* Video element — no native controls */}
      {/* @ts-ignore */}
      <video
        ref={videoRef}
        src={playbackUri}
        autoPlay
        style={divStyles.video}
        onClick={togglePlay}
      />

      {/* Loading spinner overlay */}
      {videoLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#818cf8" />
          <Text style={styles.loadingText}>Buffering…</Text>
        </View>
      )}

      {/* Status overlay (error / initial connection) */}
      <PlayerStatusOverlay
        streamState={streamState}
        streamMetrics={streamMetrics}
        isBuffering={isBuffering}
        errorMessage={errorMessage}
        onBack={onClose}
      />

      {/* Custom overlay — always on top of video */}
      {controlsVisible && (
        // @ts-ignore
        <div
          style={divStyles.controlsLayer}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Top bar */}
          <View style={styles.topBar}>
            <Pressable style={styles.topBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color="#fff" />
              <Text style={styles.topBtnText}>Close</Text>
            </Pressable>

            <View style={styles.topRight}>
              <Pressable style={styles.topBtn} onPress={onWebCast}>
                <MaterialIcons name="cast" size={22} color="#fff" />
              </Pressable>
              <Pressable style={styles.topBtn} onPress={onSettings}>
                <Ionicons name="settings-sharp" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Center play/pause */}
          {!videoLoading && (
            <Pressable style={styles.centerPlay} onPress={togglePlay}>
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={48}
                color="#fff"
              />
            </Pressable>
          )}

          {/* Bottom controls */}
          <View style={styles.bottomBar}>
            {/* Stream info */}
            <View style={styles.infoRow}>
              <Text style={styles.streamTitle} numberOfLines={1}>
                {currentStream.title || currentStream.name || "Video"}
              </Text>
              <Text style={styles.engineLabel}>
                {engine?.getEngineType() ?? "Unknown"} •{" "}
                {stats.speed > 0
                  ? `↓ ${Math.round(stats.speed / 1024)} KB/s`
                  : ""}
                {stats.peers > 0 ? ` · ${stats.peers} peers` : ""}
              </Text>
            </View>

            {/* Scrubber */}
            {/* @ts-ignore — using raw HTML input for range slider */}
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                seek(parseFloat(e.target.value) * duration)
              }
              style={divStyles.scrubber}
            />

            {/* Time + fullscreen */}
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
              <Pressable
                style={styles.fullscreenBtn}
                onPress={toggleFullscreen}
              >
                <MaterialIcons
                  name={isFullscreen ? "fullscreen-exit" : "fullscreen"}
                  size={28}
                  color="#fff"
                />
              </Pressable>
            </View>
          </View>
        </div>
      )}

      <PlayerSettingsModal
        visible={settingsOpen}
        onClose={onSettingsClose}
        audioTracks={audioTracks}
        subtitles={subtitles}
        onSelectAudio={onSelectAudio}
        onSelectSubtitle={onSelectSubtitle}
      />
      <DesktopCastModal
        visible={castModalOpen}
        playbackUri={playbackUri}
        title={currentStream.title || currentStream.name || "Video"}
        onClose={onCastClose}
        onCastStart={onCastStart}
      />
    </div>
  );
}

// Raw CSS-in-JS for native HTML elements (div, video, input)
const divStyles: Record<string, React.CSSProperties> = {
  container: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    backgroundColor: "#000",
    overflow: "hidden",
    cursor: "default",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: "#000",
  },
  controlsLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    zIndex: 50,
    background:
      "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.7) 100%)",
  },
  scrubber: {
    width: "100%",
    height: 6,
    accentColor: "#818cf8",
    cursor: "pointer",
    margin: "4px 0",
  },
};

// React Native styles for cross-platform components used in overlays
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 30,
    gap: 12,
  },
  loadingText: {
    color: "#e0e0ff",
    fontSize: 15,
    fontWeight: "600",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  topRight: {
    flexDirection: "row",
    gap: 12,
  },
  topBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  topBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  centerPlay: {
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
    borderRadius: 40,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 6,
  },
  infoRow: {
    marginBottom: 4,
  },
  streamTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  engineLabel: {
    color: "#a1a1aa",
    fontSize: 12,
    marginTop: 2,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeText: {
    color: "#d4d4d8",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  fullscreenBtn: {
    padding: 4,
  },
  // Cast styles (reused from player.tsx)
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
