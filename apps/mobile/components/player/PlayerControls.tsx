import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { VideoPlayer } from "expo-video";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

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

const SEEK_STEP_SECONDS = 10;

export function PlayerControls({
  player,
  currentTime,
  duration,
  isVisible,
  onPlayPause,
  isPlaying,
}: PlayerControlsProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  if (!isVisible) return null;

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime =
    Number.isFinite(currentTime) && currentTime > 0
      ? Math.min(currentTime, safeDuration || currentTime)
      : 0;
  const progressPercent =
    safeDuration > 0
      ? Math.min(100, Math.max(0, (safeCurrentTime / safeDuration) * 100))
      : 0;
  const currentTimeLabel = formatTime(safeCurrentTime);
  const durationLabel = formatTime(safeDuration);
  const nativePassthrough =
    Platform.OS === "web" ? {} : ({ pointerEvents: "box-none" } as const);
  const playPauseLabel = isPlaying
    ? t("player.controls.pause", { defaultValue: "Pause playback" })
    : t("player.controls.play", { defaultValue: "Play playback" });
  const seekBackLabel = t("player.controls.seekBack", {
    defaultValue: "Seek back 10 seconds",
  });
  const seekForwardLabel = t("player.controls.seekForward", {
    defaultValue: "Seek forward 10 seconds",
  });
  const progressLabel = t("player.controls.progress", {
    defaultValue: "Playback progress",
  });

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[styles.container, Platform.OS === "web" && styles.webPassThrough]}
      {...nativePassthrough}
    >
      <View
        style={[
          styles.centerControls,
          Platform.OS === "web" && styles.webPassThrough,
        ]}
        {...nativePassthrough}
      >
        <ControlButton
          icon="play-back"
          label={seekBackLabel}
          onPress={() => player.seekBy(-SEEK_STEP_SECONDS)}
          colors={colors}
          isDark={isDark}
        />
        <Pressable
          style={({ pressed, hovered }: any) => [
            styles.playPauseBtn,
            Platform.OS === "web" && styles.webInteractive,
            {
              backgroundColor: isDark
                ? "rgba(18,18,30,0.76)"
                : "rgba(255,255,255,0.82)",
              borderColor: colors.border,
              opacity: pressed ? 0.82 : 1,
            },
            hovered && styles.hoveredButton,
          ]}
          onPress={onPlayPause}
          accessibilityRole="button"
          accessibilityLabel={playPauseLabel}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={46}
            color={colors.tint}
            style={{ marginLeft: isPlaying ? 0 : 4 }}
          />
        </Pressable>
        <ControlButton
          icon="play-forward"
          label={seekForwardLabel}
          onPress={() => player.seekBy(SEEK_STEP_SECONDS)}
          colors={colors}
          isDark={isDark}
        />
      </View>

      <View
        style={[
          styles.bottomControls,
          Platform.OS === "web" && styles.webInteractive,
        ]}
      >
        <View
          style={[
            styles.bottomTray,
            {
              backgroundColor: isDark
                ? "rgba(18,18,30,0.72)"
                : "rgba(255,255,255,0.82)",
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.timeText, { color: colors.text }]}>
            {currentTimeLabel}
          </Text>

          <View
            style={styles.scrubberContainer}
            accessibilityRole="adjustable"
            accessibilityLabel={progressLabel}
            accessibilityActions={[
              { name: "decrement", label: seekBackLabel },
              { name: "increment", label: seekForwardLabel },
            ]}
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(progressPercent),
              text: `${currentTimeLabel} of ${durationLabel}`,
            }}
            onAccessibilityAction={(event) => {
              switch (event.nativeEvent.actionName) {
                case "increment":
                  player.seekBy(SEEK_STEP_SECONDS);
                  break;
                case "decrement":
                  player.seekBy(-SEEK_STEP_SECONDS);
                  break;
              }
            }}
          >
            <View
              style={[
                styles.scrubberTrack,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.13)"
                    : "rgba(40,34,54,0.12)",
                },
              ]}
            >
              <View
                style={[
                  styles.scrubberFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: colors.tint,
                  },
                ]}
              />
              <View
                style={[
                  styles.scrubberThumb,
                  {
                    left: `${progressPercent}%`,
                    backgroundColor: colors.text,
                    borderColor: isDark
                      ? "rgba(255,255,255,0.24)"
                      : "rgba(40,34,54,0.16)",
                  },
                ]}
              />
            </View>
          </View>

          <Text style={[styles.timeText, { color: colors.text }]}>
            {durationLabel}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  colors,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark: boolean;
}) {
  return (
    <Pressable
      style={({ pressed, hovered }: any) => [
        styles.skipButton,
        Platform.OS === "web" && styles.webInteractive,
        {
          backgroundColor: isDark
            ? "rgba(18,18,30,0.66)"
            : "rgba(255,255,255,0.76)",
          borderColor: colors.border,
          opacity: pressed ? 0.78 : 1,
        },
        hovered && styles.hoveredButton,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      <Text style={[styles.skipText, { color: colors.textSecondary }]}>
        {SEEK_STEP_SECONDS}s
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15,
    justifyContent: "space-between",
  },
  webPassThrough: {
    pointerEvents: "none",
  },
  webInteractive: {
    pointerEvents: "auto",
  },
  centerControls: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
  },
  playPauseBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  skipButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 1,
  },
  skipText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
  hoveredButton: {
    transform: [{ scale: 1.04 }],
  },
  bottomControls: {
    paddingHorizontal: 24,
    paddingBottom: 48, // space for the bottom InfoBar
    paddingTop: 20,
  },
  bottomTray: {
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
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
    marginHorizontal: 14,
  },
  scrubberTrack: {
    height: 7,
    borderRadius: 4,
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
    top: -5.5,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    backgroundColor: "#fff",
    transform: [{ translateX: -9 }],
  },
});
