import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoPlayer } from "expo-video";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

interface PlayerControlsProps {
  player: VideoPlayer;
  currentTime: number;
  duration: number;
  isVisible: boolean;
  onPlayPause: () => void;
  isPlaying: boolean;
}

function formatTime(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function PlayerControls({
  player,
  currentTime,
  duration,
  isVisible,
  onPlayPause,
  isPlaying,
}: PlayerControlsProps) {
  if (!isVisible) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
      pointerEvents="box-none"
    >
      <View style={styles.centerControls} pointerEvents="box-none">
        <Pressable style={styles.playPauseBtn} onPress={onPlayPause}>
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={48}
            color="#fff"
            style={{ marginLeft: isPlaying ? 0 : 4 }}
          />
        </Pressable>
      </View>

      <View style={styles.bottomControls}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>

        <View style={styles.scrubberContainer}>
          <View style={styles.scrubberTrack}>
            <View
              style={[styles.scrubberFill, { width: `${progressPercent}%` }]}
            />
            <View
              style={[styles.scrubberThumb, { left: `${progressPercent}%` }]}
            />
          </View>
        </View>

        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15,
    justifyContent: "space-between",
  },
  centerControls: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  playPauseBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  bottomControls: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 48, // space for the bottom InfoBar
    paddingTop: 20,
    // Add a subtle gradient background conceptually here if needed via LinearGradient
  },
  timeText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  scrubberContainer: {
    flex: 1,
    height: 40,
    justifyContent: "center",
    marginHorizontal: 16,
  },
  scrubberTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    position: "relative",
  },
  scrubberFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#818cf8",
    borderRadius: 3,
  },
  scrubberThumb: {
    position: "absolute",
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
    transform: [{ translateX: -8 }],
  },
});
