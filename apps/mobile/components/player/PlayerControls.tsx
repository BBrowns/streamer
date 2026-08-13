import { useState } from "react";
import {
  GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
import { useUiMotion } from "../../hooks/useUiMotion";
import { useWindowClass } from "../../hooks/useWindowClass";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { playerChrome } from "./playerChrome";
import { PlayerTimeline } from "./PlayerTimeline";
import type { TimelineScrubbingChange } from "../../services/playback/TimelineController";
import type { PlaybackSegmentKind } from "../../services/playback/PlaybackSegmentsProvider";

export interface PlayerControlCapabilities {
  canSeek: boolean;
  isLive?: boolean;
  isRemux?: boolean;
  /**
   * A progressive fMP4 stream starts quickly, but does not expose byte-range
   * seeking unless a separate seekable cache is made available later.
   */
  isProgressiveRemux?: boolean;
  /** Runtime-only state of the optional seekable cache behind a live fMP4. */
  seekableCacheStatus?:
    | "not_started"
    | "evaluating"
    | "preparing"
    | "unavailable";
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
  bufferedPosition?: number;
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
  activeSegment?: {
    kind: PlaybackSegmentKind;
    endSeconds: number;
  } | null;
  muted?: boolean;
  volume?: number;
  onSeekBy?: (seconds: number) => void;
  onSeekTo?: (seconds: number) => void;
  onPreviewSeek?: (seconds: number) => void;
  onScrubbingChange?: (change: TimelineScrubbingChange) => void;
  getThumbnail?: (position: number) => Promise<unknown | null>;
  onToggleMute?: () => void;
  onVolumeChange?: (volume: number) => void;
  onToggleFullscreen?: () => void;
  onOpenSettings?: () => void;
  onOpenCast?: () => void;
  onRetry?: () => void;
  onSkipSegment?: (endSeconds: number) => void;
}

const SEEK_STEP_SECONDS = 10;
const PLAYER_TEXT = playerChrome.text;
const PLAYER_MUTED_TEXT = playerChrome.textMuted;
const PLAYER_CONTROL_BACKGROUND = playerChrome.surface;
const PLAYER_CONTROL_HOVER = playerChrome.surfaceHover;
const PLAYER_CONTROL_BORDER = playerChrome.border;

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
  bufferedPosition = 0,
  isVisible,
  onPlayPause,
  isPlaying,
  capabilities,
  sourceLabel,
  castStatus,
  downloadStatus,
  fallbackReason,
  activeSegment,
  muted = false,
  volume = 1,
  onSeekBy,
  onSeekTo,
  onPreviewSeek,
  onScrubbingChange,
  getThumbnail,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onOpenSettings,
  onOpenCast,
  onRetry,
  onSkipSegment,
}: PlayerControlsProps) {
  const { t } = useTranslation();
  const { isCompact } = useWindowClass();
  const { reducedMotion, duration: motionDuration } = useUiMotion();
  const insets = useSafeAreaInsets();
  const compactLayout = isCompact;
  const [volumeTrackWidth, setVolumeTrackWidth] = useState(0);

  if (!isVisible) return null;

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const canSeek = capabilities?.canSeek ?? safeDuration > 0;
  const hasTimeline = canSeek && safeDuration > 0;
  const isLive = Boolean(capabilities?.isLive || duration === Infinity);
  const seekDisabledLabel = t("player.controls.seekUnavailable", {
    defaultValue: "Seek unavailable",
  });
  const seekPreparationActive =
    capabilities?.seekableCacheStatus === "evaluating" ||
    capabilities?.seekableCacheStatus === "preparing";
  const seekUnavailableDetail = capabilities?.isProgressiveRemux
    ? seekPreparationActive
      ? t("player.controls.seekProgressiveRemuxPreparing", {
          defaultValue:
            "Preparing seek controls in the background. Playback can continue while this finishes.",
        })
      : capabilities.seekableCacheStatus === "unavailable"
        ? t("player.controls.seekProgressiveRemuxUnavailable", {
            defaultValue:
              "Seeking is unavailable for this source. Playback can continue or you can try another source.",
          })
        : t("player.controls.seekProgressiveRemuxStarting", {
            defaultValue: "Seeking will start preparing after playback begins.",
          })
    : capabilities?.isRemux
      ? t("player.controls.seekRemuxUnavailable", {
          defaultValue: "Seeking is unavailable while this stream is prepared",
        })
      : isLive
        ? t("player.controls.seekLiveUnavailable", {
            defaultValue: "Live streams use the live edge",
          })
        : t("player.controls.seekDurationUnavailable", {
            defaultValue: "Timeline is unavailable until duration is known",
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
  const capabilityMessage = !hasTimeline
    ? capabilities?.isProgressiveRemux
      ? seekPreparationActive
        ? t("player.controls.progressiveRemuxPreparing", {
            defaultValue: "Preparing seek controls",
          })
        : capabilities.seekableCacheStatus === "unavailable"
          ? t("player.controls.progressiveRemuxNoSeek", {
              defaultValue: "Live-compatible stream",
            })
          : t("player.controls.progressiveRemux", {
              defaultValue: "Live-compatible stream",
            })
      : capabilities?.isRemux
        ? t("player.controls.remuxPreparing", {
            defaultValue: "Preparing compatible stream",
          })
        : isLive
          ? t("player.controls.liveStream", { defaultValue: "Live stream" })
          : seekDisabledLabel
    : null;
  const seekBy = (seconds: number) => {
    if (!hasTimeline) return;
    if (onSeekBy) onSeekBy(seconds);
    else player.seekBy(seconds);
  };
  const skipSegmentLabel = activeSegment
    ? activeSegment.kind === "intro"
      ? t("player.controls.skipIntro", { defaultValue: "Skip intro" })
      : activeSegment.kind === "recap"
        ? t("player.controls.skipRecap", { defaultValue: "Skip recap" })
        : activeSegment.kind === "credits"
          ? t("player.controls.skipCredits", { defaultValue: "Skip credits" })
          : activeSegment.kind === "preview"
            ? t("player.controls.skipPreview", {
                defaultValue: "Skip preview",
              })
            : t("player.controls.skipPostCredits", {
                defaultValue: "Skip post-credits",
              })
    : null;

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
      entering={
        reducedMotion ? undefined : FadeIn.duration(motionDuration("overlay"))
      }
      exiting={
        reducedMotion ? undefined : FadeOut.duration(motionDuration("overlay"))
      }
      style={[
        styles.container,
        Platform.OS === "web" ? styles.webPassThrough : styles.nativeBoxNone,
      ]}
      testID="player-controls-cinematic"
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
          reducedMotion={reducedMotion}
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
            hovered &&
              (reducedMotion
                ? styles.playHoveredButtonReducedMotion
                : styles.playHoveredButton),
            Platform.OS === "web" &&
              focused &&
              getWebFocusStyle(playerChrome.focus),
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
          reducedMotion={reducedMotion}
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
          <PlayerTimeline
            currentTime={currentTime}
            duration={safeDuration}
            bufferedPosition={bufferedPosition}
            isPlaying={isPlaying}
            canSeek={hasTimeline}
            unavailableMessage={seekUnavailableDetail}
            onSeekBy={seekBy}
            onPreviewSeek={(position) => {
              if (onPreviewSeek) onPreviewSeek(position);
              else player.currentTime = position;
            }}
            onSeekTo={(position) => {
              if (onSeekTo) onSeekTo(position);
              else player.currentTime = position;
            }}
            onScrubbingChange={onScrubbingChange}
            getThumbnail={getThumbnail}
          />

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
                />
              ) : null}
              {downloadStatus ? (
                <StatusPill icon="cloud-done" label={downloadStatus} />
              ) : null}
              {castStatus ? <StatusPill icon="tv" label={castStatus} /> : null}
              {fallbackReason ? (
                <StatusPill
                  icon="git-compare"
                  label={t("player.controls.fallbackActive", {
                    defaultValue: "Trying fallback",
                  })}
                />
              ) : null}
              {capabilityMessage && !compactLayout ? (
                <StatusPill
                  icon={capabilities?.isRemux ? "construct" : "radio"}
                  label={capabilityMessage}
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
              {activeSegment && skipSegmentLabel && onSkipSegment ? (
                <SegmentSkipButton
                  label={skipSegmentLabel}
                  onPress={() => onSkipSegment(activeSegment.endSeconds)}
                  reducedMotion={reducedMotion}
                />
              ) : null}
              {capabilities?.canUseVolume && onToggleMute ? (
                <ActionButton
                  icon={
                    muted || normalizedVolume === 0
                      ? "volume-mute"
                      : "volume-high"
                  }
                  label={volumeLabel}
                  onPress={onToggleMute}
                  reducedMotion={reducedMotion}
                />
              ) : null}
              {capabilities?.canUseVolume && onVolumeChange ? (
                <Pressable
                  testID="player-volume-slider"
                  style={({ focused }: any) => [
                    styles.volumeSlider,
                    Platform.OS === "web" &&
                      focused &&
                      getWebFocusStyle(playerChrome.focus),
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
                  reducedMotion={reducedMotion}
                />
              ) : null}
              {capabilities?.canCast && onOpenCast ? (
                <ActionButton
                  icon="tv"
                  label={t("player.controls.cast", { defaultValue: "Cast" })}
                  onPress={onOpenCast}
                  reducedMotion={reducedMotion}
                />
              ) : null}
              {capabilities?.canRetry && onRetry ? (
                <ActionButton
                  icon="refresh"
                  label={t("player.controls.retrySource", {
                    defaultValue: "Retry source",
                  })}
                  onPress={onRetry}
                  reducedMotion={reducedMotion}
                />
              ) : null}
              {capabilities?.canUseFullscreen && onToggleFullscreen ? (
                <ActionButton
                  icon="expand"
                  label={t("player.controls.fullscreen", {
                    defaultValue: "Fullscreen",
                  })}
                  onPress={onToggleFullscreen}
                  reducedMotion={reducedMotion}
                />
              ) : null}
            </View>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function SegmentSkipButton({
  label,
  onPress,
  reducedMotion,
}: {
  label: string;
  onPress: () => void;
  reducedMotion: boolean;
}) {
  return (
    <Pressable
      style={({ pressed, hovered, focused }: any) => [
        styles.segmentSkipButton,
        {
          backgroundColor: PLAYER_TEXT,
          borderColor: PLAYER_TEXT,
          opacity: pressed ? 0.82 : 1,
        },
        hovered &&
          (reducedMotion
            ? styles.hoveredButtonReducedMotion
            : styles.hoveredButton),
        Platform.OS === "web" &&
          focused &&
          getWebFocusStyle(playerChrome.focus),
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="play-skip-forward" size={17} color="#08090C" />
      <Text style={styles.segmentSkipText}>{label}</Text>
    </Pressable>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  reducedMotion,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  reducedMotion: boolean;
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
        hovered &&
          !disabled &&
          (reducedMotion
            ? styles.hoveredButtonReducedMotion
            : styles.hoveredButton),
        Platform.OS === "web" &&
          focused &&
          getWebFocusStyle(playerChrome.focus),
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
  reducedMotion,
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  reducedMotion: boolean;
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
        hovered &&
          (reducedMotion
            ? styles.hoveredButtonReducedMotion
            : styles.hoveredButton),
        Platform.OS === "web" &&
          focused &&
          getWebFocusStyle(playerChrome.focus),
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
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
      <Ionicons name={icon} size={14} color={playerChrome.accent} />
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
    ...StyleSheet.absoluteFill,
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
  hoveredButtonReducedMotion: {
    backgroundColor: PLAYER_CONTROL_HOVER,
  },
  playHoveredButton: {
    backgroundColor: "#FFFFFF",
    transform: [{ scale: 1.035 }],
  },
  playHoveredButtonReducedMotion: {
    backgroundColor: "#FFFFFF",
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
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: uiSpacing.sm,
  },
  segmentSkipButton: {
    minHeight: uiTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.xs,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
  },
  segmentSkipText: {
    ...uiTypography.caption,
    color: "#08090C",
    fontWeight: "800",
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
