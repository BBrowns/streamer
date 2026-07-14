import { useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import type { VideoPlayer } from "expo-video";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useWindowClass } from "../../hooks/useWindowClass";

export interface PlayerControlCapabilities {
  canSeek: boolean;
  isLive?: boolean;
  isRemux?: boolean;
  canUseVolume?: boolean;
  canUseFullscreen?: boolean;
  hasCaptions?: boolean;
  canCast?: boolean;
  canRetry?: boolean;
}

interface PlayerControlsProps {
  player: VideoPlayer;
  currentTime: number;
  duration: number;
  isVisible: boolean;
  onPlayPause: () => void;
  isPlaying: boolean;
  capabilities?: PlayerControlCapabilities;
  sourceLabel?: string;
  castStatus?: string | null;
  downloadStatus?: string | null;
  fallbackReason?: string | null;
  muted?: boolean;
  volume?: number;
  onSeekBy?: (seconds: number) => void;
  onSeekTo?: (seconds: number) => void;
  onToggleMute?: () => void;
  onVolumeChange?: (volume: number) => void;
  onToggleFullscreen?: () => void;
  onOpenSettings?: () => void;
  onOpenCast?: () => void;
  onRetry?: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
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
  capabilities,
  sourceLabel,
  castStatus,
  downloadStatus,
  fallbackReason,
  muted = false,
  volume = 1,
  onSeekBy,
  onSeekTo,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onOpenSettings,
  onOpenCast,
  onRetry,
}: PlayerControlsProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { isCompact } = useWindowClass();
  const reducedMotion = useReducedMotion();
  const compactLayout = isCompact;
  const [scrubberWidth, setScrubberWidth] = useState(0);

  if (!isVisible) return null;

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime =
    Number.isFinite(currentTime) && currentTime > 0
      ? Math.min(currentTime, safeDuration || currentTime)
      : 0;
  const canSeek = capabilities?.canSeek ?? safeDuration > 0;
  const hasTimeline = canSeek && safeDuration > 0;
  const isLive = Boolean(capabilities?.isLive || duration === Infinity);
  const progressPercent = hasTimeline
    ? Math.min(100, Math.max(0, (safeCurrentTime / safeDuration) * 100))
    : 0;
  const currentTimeLabel = formatTime(safeCurrentTime);
  const durationLabel = isLive
    ? t("player.controls.live", { defaultValue: "Live" })
    : safeDuration > 0
      ? formatTime(safeDuration)
      : t("player.controls.unknownDuration", { defaultValue: "--:--" });
  const seekDisabledLabel = t("player.controls.seekUnavailable", {
    defaultValue: "Seek unavailable",
  });
  const seekUnavailableDetail = capabilities?.isRemux
    ? t("player.controls.seekRemuxUnavailable", {
        defaultValue: "Seeking unlocks when the compatible stream is ready",
      })
    : isLive
      ? t("player.controls.seekLiveUnavailable", {
          defaultValue: "Live streams use the live edge",
        })
      : t("player.controls.seekDurationUnavailable", {
          defaultValue: "Timeline is unavailable until duration is known",
        });
  const progressLabel = hasTimeline
    ? t("player.controls.progress", { defaultValue: "Playback progress" })
    : t("player.controls.progressUnavailable", {
        defaultValue: "Playback progress unavailable",
      });
  const playPauseLabel = isPlaying
    ? t("player.controls.pause", { defaultValue: "Pause playback" })
    : t("player.controls.play", { defaultValue: "Play playback" });
  const seekBackLabel = hasTimeline
    ? t("player.controls.seekBack", {
        defaultValue: "Seek back 10 seconds",
      })
    : t("player.controls.seekBackUnavailable", {
        defaultValue: "Seek back unavailable",
      });
  const seekForwardLabel = hasTimeline
    ? t("player.controls.seekForward", {
        defaultValue: "Seek forward 10 seconds",
      })
    : t("player.controls.seekForwardUnavailable", {
        defaultValue: "Seek forward unavailable",
      });
  const capabilityMessage = capabilities?.isRemux
    ? t("player.controls.remuxPreparing", {
        defaultValue: "Preparing compatible stream",
      })
    : isLive
      ? t("player.controls.liveStream", { defaultValue: "Live stream" })
      : !hasTimeline
        ? seekDisabledLabel
        : null;
  const seekBy = (seconds: number) => {
    if (!hasTimeline) return;
    if (onSeekBy) onSeekBy(seconds);
    else player.seekBy(seconds);
  };

  const seekTo = (seconds: number) => {
    if (!hasTimeline) return;
    const clamped = Math.min(Math.max(seconds, 0), safeDuration);
    if (onSeekTo) onSeekTo(clamped);
    else player.currentTime = clamped;
  };

  const handleScrubberLayout = (event: LayoutChangeEvent) => {
    setScrubberWidth(event.nativeEvent.layout.width);
  };

  const handleScrubberPress = (event: GestureResponderEvent) => {
    if (!hasTimeline || scrubberWidth <= 0) return;
    const nativeEvent =
      event.nativeEvent as GestureResponderEvent["nativeEvent"] & {
        offsetX?: number;
      };
    const locationX =
      typeof nativeEvent.locationX === "number"
        ? nativeEvent.locationX
        : nativeEvent.offsetX;
    if (typeof locationX !== "number") return;
    seekTo((locationX / scrubberWidth) * safeDuration);
  };

  const volumeLabel = muted
    ? t("player.controls.unmute", { defaultValue: "Unmute" })
    : t("player.controls.mute", { defaultValue: "Mute" });
  const normalizedVolume = Math.min(1, Math.max(0, volume));
  const setVolume = (nextVolume: number) => {
    onVolumeChange?.(Math.min(1, Math.max(0, nextVolume)));
  };

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(200)}
      exiting={reducedMotion ? undefined : FadeOut.duration(200)}
      style={[
        styles.container,
        Platform.OS === "web" ? styles.webPassThrough : styles.nativeBoxNone,
      ]}
    >
      <View
        style={[
          styles.centerControls,
          compactLayout && styles.centerControlsCompact,
          Platform.OS === "web" ? styles.webPassThrough : styles.nativeBoxNone,
        ]}
      >
        <ControlButton
          icon="play-back"
          label={seekBackLabel}
          onPress={() => seekBy(-SEEK_STEP_SECONDS)}
          colors={colors}
          isDark={isDark}
          disabled={!hasTimeline}
        />
        <Pressable
          style={({ pressed, hovered, focused }: any) => [
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
            Platform.OS === "web" && focused && getWebFocusStyle(colors.tint),
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
          onPress={() => seekBy(SEEK_STEP_SECONDS)}
          colors={colors}
          isDark={isDark}
          disabled={!hasTimeline}
        />
      </View>

      <View
        style={[
          styles.bottomControls,
          compactLayout && styles.bottomControlsCompact,
          Platform.OS === "web" && styles.webInteractive,
        ]}
      >
        <View
          style={[
            styles.bottomTray,
            compactLayout && styles.bottomTrayCompact,
            {
              backgroundColor: isDark
                ? "rgba(18,18,30,0.78)"
                : "rgba(255,255,255,0.88)",
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            {sourceLabel ? (
              <StatusPill
                icon="sparkles"
                label={sourceLabel}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
            {downloadStatus ? (
              <StatusPill
                icon="cloud-done"
                label={downloadStatus}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
            {castStatus ? (
              <StatusPill
                icon="tv"
                label={castStatus}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
            {fallbackReason ? (
              <StatusPill
                icon="git-compare"
                label={t("player.controls.fallbackActive", {
                  defaultValue: "Trying fallback",
                })}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
            {capabilityMessage ? (
              <StatusPill
                icon={capabilities?.isRemux ? "construct" : "radio"}
                label={capabilityMessage}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
          </View>

          <View style={styles.timelineRow}>
            <Text style={[styles.timeText, { color: colors.text }]}>
              {currentTimeLabel}
            </Text>

            <Pressable
              style={({ focused }: any) => [
                styles.scrubberContainer,
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.tint),
              ]}
              accessibilityRole="adjustable"
              accessibilityLabel={progressLabel}
              accessibilityState={{ disabled: !hasTimeline }}
              accessibilityActions={
                hasTimeline
                  ? [
                      { name: "decrement", label: seekBackLabel },
                      { name: "increment", label: seekForwardLabel },
                    ]
                  : []
              }
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(progressPercent),
                text: hasTimeline
                  ? `${currentTimeLabel} of ${durationLabel}`
                  : seekUnavailableDetail,
              }}
              disabled={!hasTimeline}
              onPress={handleScrubberPress}
              onLayout={handleScrubberLayout}
              onAccessibilityAction={(event) => {
                if (!hasTimeline) return;
                switch (event.nativeEvent.actionName) {
                  case "increment":
                    seekBy(SEEK_STEP_SECONDS);
                    break;
                  case "decrement":
                    seekBy(-SEEK_STEP_SECONDS);
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
                    opacity: hasTimeline ? 1 : 0.58,
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
                {hasTimeline ? (
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
                ) : null}
              </View>
            </Pressable>

            <Text style={[styles.timeText, { color: colors.text }]}>
              {durationLabel}
            </Text>
          </View>
          {!hasTimeline ? (
            <Text
              style={[styles.timelineHint, { color: colors.textSecondary }]}
            >
              {seekUnavailableDetail}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            {capabilities?.canUseVolume && onToggleMute ? (
              <ActionButton
                icon={
                  muted || normalizedVolume === 0
                    ? "volume-mute"
                    : "volume-high"
                }
                label={volumeLabel}
                onPress={onToggleMute}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
            {capabilities?.canUseVolume && onVolumeChange ? (
              <View
                style={[
                  styles.volumeCluster,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(40,34,54,0.06)",
                  },
                ]}
              >
                <ActionButton
                  icon="remove"
                  label={t("player.controls.volumeDown", {
                    defaultValue: "Volume down",
                  })}
                  onPress={() => setVolume(normalizedVolume - 0.1)}
                  colors={colors}
                  isDark={isDark}
                  compact
                />
                <Text style={[styles.volumeText, { color: colors.text }]}>
                  {Math.round(normalizedVolume * 100)}
                </Text>
                <ActionButton
                  icon="add"
                  label={t("player.controls.volumeUp", {
                    defaultValue: "Volume up",
                  })}
                  onPress={() => setVolume(normalizedVolume + 0.1)}
                  colors={colors}
                  isDark={isDark}
                  compact
                />
              </View>
            ) : null}
            {onOpenSettings ? (
              <ActionButton
                icon={capabilities?.hasCaptions ? "text" : "options"}
                label={t("player.controls.settings", {
                  defaultValue: "Audio, subtitles, and source",
                })}
                onPress={onOpenSettings}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
            {capabilities?.canCast && onOpenCast ? (
              <ActionButton
                icon="tv"
                label={t("player.controls.cast", { defaultValue: "Cast" })}
                onPress={onOpenCast}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
            {capabilities?.canRetry && onRetry ? (
              <ActionButton
                icon="refresh"
                label={t("player.controls.retrySource", {
                  defaultValue: "Retry source",
                })}
                onPress={onRetry}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
            {capabilities?.canUseFullscreen && onToggleFullscreen ? (
              <ActionButton
                icon="expand"
                label={t("player.controls.fullscreen", {
                  defaultValue: "Fullscreen",
                })}
                onPress={onToggleFullscreen}
                colors={colors}
                isDark={isDark}
              />
            ) : null}
          </View>
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
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed, hovered, focused }: any) => [
        styles.skipButton,
        Platform.OS === "web" && styles.webInteractive,
        {
          backgroundColor: isDark
            ? "rgba(18,18,30,0.66)"
            : "rgba(255,255,255,0.76)",
          borderColor: colors.border,
          opacity: disabled ? 0.38 : pressed ? 0.78 : 1,
        },
        hovered && !disabled && styles.hoveredButton,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.tint),
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      <Text style={[styles.skipText, { color: colors.textSecondary }]}>
        {SEEK_STEP_SECONDS}s
      </Text>
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  colors,
  isDark,
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed, hovered, focused }: any) => [
        compact ? styles.compactActionButton : styles.actionButton,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(40,34,54,0.07)",
          borderColor: colors.border,
          opacity: pressed ? 0.76 : 1,
        },
        hovered && styles.hoveredButton,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.tint),
      ]}
      onPress={onPress}
      hitSlop={compact ? 6 : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={compact ? 16 : 18} color={colors.text} />
    </Pressable>
  );
}

function StatusPill({
  icon,
  label,
  colors,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.statusPill,
        {
          borderColor: colors.border,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(40,34,54,0.07)",
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={colors.tint} />
      <Text
        numberOfLines={1}
        style={[styles.statusPillText, { color: colors.textSecondary }]}
      >
        {label}
      </Text>
    </View>
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
  nativeBoxNone: {
    pointerEvents: "box-none",
  },
  webInteractive: {
    pointerEvents: "auto",
  },
  centerControls: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: uiSpacing.lg,
  },
  centerControlsCompact: {
    gap: uiSpacing.md,
  },
  playPauseBtn: {
    width: 82,
    height: 82,
    borderRadius: uiRadii.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  skipButton: {
    width: 58,
    height: 58,
    borderRadius: uiRadii.pill,
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
    paddingHorizontal: uiSpacing.xl,
    paddingBottom: Platform.OS === "web" ? 112 : 56,
    paddingTop: uiSpacing.xl,
  },
  bottomControlsCompact: {
    paddingHorizontal: uiSpacing.sm,
    paddingBottom: Platform.OS === "web" ? 74 : 24,
    paddingTop: uiSpacing.sm,
  },
  bottomTray: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    borderRadius: uiRadii.xl + 2,
    borderWidth: 1,
    paddingHorizontal: uiSpacing.lg - 2,
    paddingVertical: uiSpacing.md,
    gap: uiSpacing.sm + 2,
  },
  bottomTrayCompact: {
    borderRadius: uiRadii.md,
    paddingHorizontal: uiSpacing.sm,
    paddingVertical: uiSpacing.sm,
    gap: uiSpacing.xs,
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  statusPill: {
    minHeight: 28,
    maxWidth: 280,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.xs + 2,
  },
  statusPillText: {
    flexShrink: 1,
    ...uiTypography.caption,
    fontSize: 11,
    fontWeight: "800",
  },
  timelineRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
  },
  timeText: {
    color: "#f8fafc",
    width: 54,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  scrubberContainer: {
    flex: 1,
    height: 40,
    justifyContent: "center",
    marginHorizontal: uiSpacing.sm + 2,
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
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: uiSpacing.sm,
  },
  actionButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  compactActionButton: {
    width: 32,
    height: 32,
    borderRadius: uiRadii.pill,
    justifyContent: "center",
    alignItems: "center",
  },
  volumeCluster: {
    minHeight: uiTouchTarget,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.xs,
  },
  volumeText: {
    minWidth: 28,
    textAlign: "center",
    ...uiTypography.caption,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timelineHint: {
    ...uiTypography.caption,
    textAlign: "center",
    marginTop: -2,
  },
});
