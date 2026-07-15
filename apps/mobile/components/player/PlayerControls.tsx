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
import { LinearGradient } from "expo-linear-gradient";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  audioStatus?: string | null;
  subtitleStatus?: string | null;
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
const PLAYER_TEXT = "#F4F5F7";
const PLAYER_MUTED_TEXT = "#B7BDC8";
const PLAYER_CONTROL_BACKGROUND = "rgba(8, 9, 12, 0.62)";
const PLAYER_CONTROL_HOVER = "rgba(24, 27, 33, 0.92)";
const PLAYER_CONTROL_BORDER = "rgba(255, 255, 255, 0.15)";

type SliderKeyboardAction = "decrement" | "increment" | "minimum" | "maximum";

interface WebControlKeyboardEvent {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
}

function getSliderKeyboardAction(key: string): SliderKeyboardAction | null {
  switch (key.toLowerCase()) {
    case "arrowleft":
    case "arrowdown":
      return "decrement";
    case "arrowright":
    case "arrowup":
      return "increment";
    case "home":
      return "minimum";
    case "end":
      return "maximum";
    default:
      return null;
  }
}

export function getVolumeFromKeyboard(
  currentVolume: number,
  key: string,
): number | null {
  const action = getSliderKeyboardAction(key);
  if (!action) return null;

  const normalized = Math.min(1, Math.max(0, currentVolume));
  if (action === "minimum") return 0;
  if (action === "maximum") return 1;

  const delta = action === "increment" ? 0.1 : -0.1;
  return Math.min(1, Math.max(0, Math.round((normalized + delta) * 100) / 100));
}

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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isCompact } = useWindowClass();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const compactLayout = isCompact;
  const [scrubberWidth, setScrubberWidth] = useState(0);
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(0);

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

  const handleScrubberKeyDown = (event: WebControlKeyboardEvent) => {
    if (!hasTimeline) return;
    const action = getSliderKeyboardAction(event.key);
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    if (action === "minimum") seekTo(0);
    else if (action === "maximum") seekTo(safeDuration);
    else
      seekBy(action === "increment" ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS);
  };

  const volumeLabel = muted
    ? t("player.controls.unmute", { defaultValue: "Unmute" })
    : t("player.controls.mute", { defaultValue: "Mute" });
  const volumeDownLabel = t("player.controls.volumeDown", {
    defaultValue: "Volume down",
  });
  const volumeUpLabel = t("player.controls.volumeUp", {
    defaultValue: "Volume up",
  });
  const normalizedVolume = Math.min(1, Math.max(0, volume));
  const setVolume = (nextVolume: number) => {
    onVolumeChange?.(Math.min(1, Math.max(0, nextVolume)));
  };
  const handleVolumePress = (event: GestureResponderEvent) => {
    if (volumeTrackWidth <= 0) return;
    const nativeEvent =
      event.nativeEvent as GestureResponderEvent["nativeEvent"] & {
        offsetX?: number;
      };
    const locationX =
      typeof nativeEvent.locationX === "number"
        ? nativeEvent.locationX
        : nativeEvent.offsetX;
    if (typeof locationX !== "number") return;
    setVolume(locationX / volumeTrackWidth);
  };
  const handleVolumeKeyDown = (event: WebControlKeyboardEvent) => {
    const nextVolume = getVolumeFromKeyboard(normalizedVolume, event.key);
    if (nextVolume === null) return;

    event.preventDefault();
    event.stopPropagation();
    setVolume(nextVolume);
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
          disabled={!hasTimeline}
        />
        <Pressable
          style={({ pressed, hovered, focused }: any) => [
            styles.playPauseBtn,
            Platform.OS === "web" && styles.webInteractive,
            {
              backgroundColor: PLAYER_TEXT,
              borderColor: "rgba(255,255,255,0.26)",
              opacity: pressed ? 0.82 : 1,
            },
            hovered && styles.playHoveredButton,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={onPlayPause}
          accessibilityRole="button"
          accessibilityLabel={playPauseLabel}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={34}
            color="#08090C"
            style={{ marginLeft: isPlaying ? 0 : 4 }}
          />
        </Pressable>
        <ControlButton
          icon="play-forward"
          label={seekForwardLabel}
          onPress={() => seekBy(SEEK_STEP_SECONDS)}
          colors={colors}
          disabled={!hasTimeline}
        />
      </View>

      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.86)"]}
        locations={[0, 0.42]}
        style={[
          styles.bottomControls,
          compactLayout && styles.bottomControlsCompact,
          {
            paddingBottom:
              Platform.OS === "web"
                ? compactLayout
                  ? 12
                  : 20
                : Math.max(insets.bottom + 12, 16),
          },
          Platform.OS === "web" && styles.webInteractive,
        ]}
      >
        <View
          style={[styles.bottomTray, compactLayout && styles.bottomTrayCompact]}
        >
          <View style={styles.timelineRow}>
            <Text style={[styles.timeText, { color: PLAYER_TEXT }]}>
              {currentTimeLabel}
            </Text>

            <Pressable
              testID="player-progress-slider"
              style={({ focused }: any) => [
                styles.scrubberContainer,
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.focus),
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
              {...((Platform.OS === "web"
                ? {
                    onKeyDown: handleScrubberKeyDown,
                    "aria-valuemin": 0,
                    "aria-valuemax": 100,
                    "aria-valuenow": Math.round(progressPercent),
                    "aria-valuetext": hasTimeline
                      ? `${currentTimeLabel} of ${durationLabel}`
                      : seekUnavailableDetail,
                  }
                : {}) as any)}
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
                    backgroundColor: "rgba(255,255,255,0.28)",
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
                        backgroundColor: PLAYER_TEXT,
                        borderColor: "rgba(8,9,12,0.48)",
                      },
                    ]}
                  />
                ) : null}
              </View>
            </Pressable>

            <Text style={[styles.timeText, { color: PLAYER_TEXT }]}>
              {durationLabel}
            </Text>
          </View>
          {!hasTimeline ? (
            <Text style={[styles.timelineHint, { color: PLAYER_MUTED_TEXT }]}>
              {seekUnavailableDetail}
            </Text>
          ) : null}

          <View
            testID="player-controls-toolbar"
            style={[
              styles.toolbarRow,
              compactLayout && styles.toolbarRowCompact,
            ]}
          >
            <View
              testID="player-controls-status-row"
              style={[
                styles.statusRow,
                compactLayout && styles.statusRowCompact,
              ]}
              accessibilityLiveRegion="polite"
            >
              {sourceLabel ? (
                <StatusPill
                  icon="information-circle-outline"
                  label={sourceLabel}
                  colors={colors}
                />
              ) : null}
              {downloadStatus ? (
                <StatusPill
                  icon="cloud-done"
                  label={downloadStatus}
                  colors={colors}
                />
              ) : null}
              {castStatus ? (
                <StatusPill icon="tv" label={castStatus} colors={colors} />
              ) : null}
              {fallbackReason ? (
                <StatusPill
                  icon="git-compare"
                  label={t("player.controls.fallbackActive", {
                    defaultValue: "Trying fallback",
                  })}
                  colors={colors}
                />
              ) : null}
              {capabilityMessage && !compactLayout ? (
                <StatusPill
                  icon={capabilities?.isRemux ? "construct" : "radio"}
                  label={capabilityMessage}
                  colors={colors}
                />
              ) : null}
            </View>

            <View
              testID="player-controls-action-row"
              style={[
                styles.actionRow,
                compactLayout && styles.actionRowCompact,
              ]}
            >
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
                />
              ) : null}
              {capabilities?.canUseVolume && onVolumeChange ? (
                <Pressable
                  testID="player-volume-slider"
                  style={({ focused }: any) => [
                    styles.volumeSlider,
                    Platform.OS === "web" &&
                      focused &&
                      getWebFocusStyle(colors.focus),
                  ]}
                  onLayout={(event) =>
                    setVolumeTrackWidth(event.nativeEvent.layout.width)
                  }
                  onPress={handleVolumePress}
                  {...((Platform.OS === "web"
                    ? {
                        onKeyDown: handleVolumeKeyDown,
                        "aria-valuemin": 0,
                        "aria-valuemax": 100,
                        "aria-valuenow": Math.round(normalizedVolume * 100),
                      }
                    : {}) as any)}
                  accessibilityRole="adjustable"
                  accessibilityLabel={t("player.controls.volume", {
                    defaultValue: "Volume",
                  })}
                  accessibilityValue={{
                    min: 0,
                    max: 100,
                    now: Math.round(normalizedVolume * 100),
                  }}
                  accessibilityActions={[
                    { name: "decrement", label: volumeDownLabel },
                    { name: "increment", label: volumeUpLabel },
                  ]}
                  onAccessibilityAction={(event) => {
                    setVolume(
                      normalizedVolume +
                        (event.nativeEvent.actionName === "increment"
                          ? 0.1
                          : -0.1),
                    );
                  }}
                >
                  <View style={styles.volumeTrack}>
                    <View
                      style={[
                        styles.volumeFill,
                        {
                          width: `${normalizedVolume * 100}%`,
                          backgroundColor: PLAYER_TEXT,
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              ) : null}
              {onOpenSettings ? (
                <ActionButton
                  icon={capabilities?.hasCaptions ? "text" : "options"}
                  label={t("player.controls.settings", {
                    defaultValue: "Audio, subtitles, and source",
                  })}
                  onPress={onOpenSettings}
                  colors={colors}
                />
              ) : null}
              {capabilities?.canCast && onOpenCast ? (
                <ActionButton
                  icon="tv"
                  label={t("player.controls.cast", { defaultValue: "Cast" })}
                  onPress={onOpenCast}
                  colors={colors}
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
                />
              ) : null}
            </View>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  colors,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed, hovered, focused }: any) => [
        styles.skipButton,
        Platform.OS === "web" && styles.webInteractive,
        {
          backgroundColor: PLAYER_CONTROL_BACKGROUND,
          borderColor: PLAYER_CONTROL_BORDER,
          opacity: disabled ? 0.38 : pressed ? 0.78 : 1,
        },
        hovered && !disabled && styles.hoveredButton,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={19} color={PLAYER_TEXT} />
      <Text style={[styles.skipText, { color: PLAYER_MUTED_TEXT }]}>
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
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  compact?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed, hovered, focused }: any) => [
        compact ? styles.compactActionButton : styles.actionButton,
        {
          backgroundColor: PLAYER_CONTROL_BACKGROUND,
          borderColor: PLAYER_CONTROL_BORDER,
          opacity: pressed ? 0.76 : 1,
        },
        hovered && styles.hoveredButton,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
      onPress={onPress}
      hitSlop={compact ? 6 : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={compact ? 16 : 18} color={PLAYER_TEXT} />
    </Pressable>
  );
}

function StatusPill({
  icon,
  label,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View
      style={[
        styles.statusPill,
        {
          borderColor: PLAYER_CONTROL_BORDER,
          backgroundColor: PLAYER_CONTROL_BACKGROUND,
        },
      ]}
    >
      <Ionicons name={icon} size={14} color={colors.tint} />
      <Text
        numberOfLines={1}
        style={[styles.statusPillText, { color: PLAYER_MUTED_TEXT }]}
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
    width: 64,
    height: 64,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  skipButton: {
    width: 48,
    height: 48,
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
    backgroundColor: PLAYER_CONTROL_HOVER,
    transform: [{ scale: 1.035 }],
  },
  playHoveredButton: {
    backgroundColor: "#FFFFFF",
    transform: [{ scale: 1.035 }],
  },
  bottomControls: {
    paddingHorizontal: uiSpacing.xxl,
    paddingTop: 56,
  },
  bottomControlsCompact: {
    paddingHorizontal: uiSpacing.sm,
    paddingTop: uiSpacing.sm,
  },
  bottomTray: {
    width: "100%",
    maxWidth: 1440,
    alignSelf: "center",
    paddingHorizontal: uiSpacing.sm,
    paddingVertical: uiSpacing.xs,
    gap: uiSpacing.xs,
  },
  bottomTrayCompact: {
    paddingHorizontal: uiSpacing.xs,
    paddingVertical: uiSpacing.xs,
    gap: uiSpacing.xs,
  },
  toolbarRow: {
    minHeight: uiTouchTarget,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.sm,
  },
  toolbarRowCompact: {
    flexDirection: "column",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: uiSpacing.xs,
  },
  statusRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  statusRowCompact: {
    flex: 0,
    width: "100%",
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
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
  },
  timeText: {
    width: 52,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  scrubberContainer: {
    flex: 1,
    height: 36,
    justifyContent: "center",
    marginHorizontal: uiSpacing.sm + 2,
  },
  scrubberTrack: {
    height: 4,
    borderRadius: 4,
    position: "relative",
  },
  scrubberFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  scrubberThumb: {
    position: "absolute",
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    transform: [{ translateX: -7 }],
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: uiSpacing.sm,
  },
  actionRowCompact: {
    width: "100%",
  },
  actionButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.md,
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
  volumeSlider: {
    width: 76,
    minHeight: uiTouchTarget,
    justifyContent: "center",
    paddingHorizontal: uiSpacing.xs,
  },
  volumeTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  volumeFill: {
    height: "100%",
    borderRadius: 2,
  },
  timelineHint: {
    ...uiTypography.caption,
    textAlign: "center",
    marginTop: -2,
  },
});
