import React, { useCallback, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import {
  GestureDetector,
  usePanGesture,
  type PanGestureActiveEvent,
  type PanGestureEvent,
} from "react-native-gesture-handler";
import { getWebFocusStyle, uiRadii, uiSpacing } from "../ui/designSystem";
import {
  TimelineController,
  clampTimelinePosition,
  type TimelineScrubbingChange,
} from "../../services/playback/TimelineController";
import {
  isMediaPositionSeekable,
  type MediaTimeRange,
} from "../../services/playback/MediaPlayerAdapter";
import { playerChrome } from "./playerChrome";
import {
  getNativePointerEvents,
  getPointerEventsStyle,
} from "../../lib/platformStyles";

const SEEK_STEP_SECONDS = 10;
const THUMBNAIL_BUCKET_SECONDS = 10;
const MAX_THUMBNAIL_CACHE_ENTRIES = 24;

interface TimelinePointerEvent {
  nativeEvent?: {
    locationX?: number;
    offsetX?: number;
  };
}

interface TimelineKeyboardEvent {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
}

export interface PlayerTimelineProps {
  currentTime: number;
  duration: number;
  bufferedPosition: number;
  bufferedRanges?: MediaTimeRange[];
  seekableRanges?: MediaTimeRange[];
  seekableOnRequest?: boolean;
  isPlaying: boolean;
  canSeek: boolean;
  unavailableMessage?: string;
  onSeekBy?: (seconds: number) => void;
  onPreviewSeek?: (position: number) => void;
  onSeekTo: (position: number) => void;
  onScrubbingChange?: (change: TimelineScrubbingChange) => void;
  getThumbnail?: (position: number) => Promise<unknown | null>;
  accent?: string;
  focusColor?: string;
}

export function formatTimelineTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = Math.floor(seconds % 60);
  const paddedRemainder = `${remainder < 10 ? "0" : ""}${remainder}`;
  if (hours > 0) {
    return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${paddedRemainder}`;
  }
  return `${Math.floor(seconds / 60)}:${paddedRemainder}`;
}

function pointerOffset(event: TimelinePointerEvent) {
  const locationX = event.nativeEvent?.locationX;
  if (typeof locationX === "number") return locationX;
  const offsetX = event.nativeEvent?.offsetX;
  return typeof offsetX === "number" ? offsetX : null;
}

function gestureOffset(
  event: PanGestureEvent | PanGestureActiveEvent,
): number | null {
  return Number.isFinite(event.x) ? event.x : null;
}

export function PlayerTimeline({
  currentTime,
  duration,
  bufferedPosition,
  bufferedRanges,
  seekableRanges,
  seekableOnRequest = false,
  isPlaying,
  canSeek,
  unavailableMessage,
  onSeekBy,
  onPreviewSeek,
  onSeekTo,
  onScrubbingChange,
  getThumbnail,
  accent = playerChrome.accent,
  focusColor = playerChrome.focus,
}: PlayerTimelineProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [thumbnailSource, setThumbnailSource] = useState<unknown | null>(null);
  const thumbnailCacheRef = useRef(new Map<number, unknown>());
  const pendingThumbnailsRef = useRef(
    new Map<number, Promise<unknown | null>>(),
  );
  const thumbnailRequestRef = useRef(0);
  const propsRef = useRef({
    onPreviewSeek,
    onSeekTo,
    onScrubbingChange,
  });
  propsRef.current = { onPreviewSeek, onSeekTo, onScrubbingChange };

  const requestThumbnail = useCallback(
    (position: number) => {
      if (!getThumbnail) {
        setThumbnailSource(null);
        return;
      }
      const bucket =
        Math.round(position / THUMBNAIL_BUCKET_SECONDS) *
        THUMBNAIL_BUCKET_SECONDS;
      const cached = thumbnailCacheRef.current.get(bucket);
      if (cached) {
        setThumbnailSource(cached);
        return;
      }

      const requestId = ++thumbnailRequestRef.current;
      let pending = pendingThumbnailsRef.current.get(bucket);
      if (!pending) {
        pending = getThumbnail(bucket).catch(() => null);
        pendingThumbnailsRef.current.set(bucket, pending);
      }
      void pending.then((source) => {
        pendingThumbnailsRef.current.delete(bucket);
        if (!source) return;
        const cache = thumbnailCacheRef.current;
        cache.delete(bucket);
        cache.set(bucket, source);
        while (cache.size > MAX_THUMBNAIL_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cache.delete(oldest);
        }
        if (requestId === thumbnailRequestRef.current) {
          setThumbnailSource(source);
        }
      });
    },
    [getThumbnail],
  );

  const controllerRef = useRef<TimelineController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new TimelineController({
      onPreview(position) {
        setPreviewPosition(position);
        propsRef.current.onPreviewSeek?.(position);
      },
      onCommit(position, shouldResume) {
        propsRef.current.onSeekTo(position);
      },
      onScrubbingChange(change) {
        const scrubbing = change.state === "started";
        setIsScrubbing(scrubbing);
        propsRef.current.onScrubbingChange?.(change);
        if (!scrubbing) {
          setPreviewPosition(null);
          setThumbnailSource(null);
        }
      },
    });
  }

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = clampTimelinePosition(currentTime, safeDuration);
  const watchedPercent =
    canSeek && safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0;
  const normalizeRanges = (ranges: readonly MediaTimeRange[]) =>
    ranges.flatMap(({ start, end }) => {
      const safeStart = clampTimelinePosition(start, safeDuration);
      const safeEnd = clampTimelinePosition(end, safeDuration);
      return safeEnd > safeStart && safeDuration > 0
        ? [
            {
              start: safeStart,
              end: safeEnd,
              left: (safeStart / safeDuration) * 100,
              width: ((safeEnd - safeStart) / safeDuration) * 100,
            },
          ]
        : [];
    });
  const seekableSegments = normalizeRanges(seekableRanges ?? []);
  const bufferedSegments = normalizeRanges(
    bufferedRanges !== undefined
      ? bufferedRanges
      : bufferedPosition > 0
        ? [{ start: 0, end: bufferedPosition }]
        : [],
  );
  const visiblePreview = isScrubbing ? previewPosition : hoverPosition;
  const currentLabel = formatTimelineTime(safeCurrentTime);
  const durationLabel =
    safeDuration > 0 ? formatTimelineTime(safeDuration) : "--:--";
  const progressLabel = canSeek
    ? t("player.controls.progress", { defaultValue: "Playback progress" })
    : t("player.controls.progressUnavailable", {
        defaultValue: "Playback progress unavailable",
      });
  const timelineActive = isScrubbing || isFocused || hoverPosition !== null;
  const isPositionSeekable = (position: number) =>
    isMediaPositionSeekable(position, seekableRanges, seekableOnRequest);

  const begin = (offset: number) => {
    if (!canSeek || width <= 0) return;
    const position = controllerRef.current?.beginDrag({
      offset,
      width,
      duration: safeDuration,
      wasPlaying: isPlaying,
      initialPosition: safeCurrentTime,
    });
    if (typeof position === "number") requestThumbnail(position);
  };

  const move = (offset: number) => {
    if (!canSeek || width <= 0) return;
    const position = controllerRef.current?.updateDrag({
      offset,
      width,
      duration: safeDuration,
    });
    if (typeof position === "number") requestThumbnail(position);
  };

  const end = () => {
    const previewPosition = controllerRef.current?.snapshot().previewPosition;
    if (
      previewPosition !== null &&
      previewPosition !== undefined &&
      !isPositionSeekable(previewPosition)
    ) {
      controllerRef.current?.cancelDrag();
      return;
    }
    controllerRef.current?.commitDrag();
  };

  const cancel = () => {
    controllerRef.current?.cancelDrag();
  };

  const panGesture = usePanGesture({
    enabled: canSeek,
    minDistance: 0,
    runOnJS: true,
    shouldCancelWhenOutside: false,
    testID: "player-timeline-gesture",
    onBegin: (event) => {
      const offset = gestureOffset(event);
      if (offset !== null) begin(offset);
    },
    onUpdate: (event) => {
      const offset = gestureOffset(event);
      if (offset !== null) move(offset);
    },
    onFinalize: (event) => {
      if (event.canceled) cancel();
      else end();
    },
  });

  const handlePointerMove = (event: TimelinePointerEvent) => {
    if (isScrubbing) return;
    const offset = pointerOffset(event);
    if (!canSeek || offset === null || width <= 0) return;
    const position = clampTimelinePosition(
      (offset / width) * safeDuration,
      safeDuration,
    );
    setHoverPosition(position);
    requestThumbnail(position);
  };

  const handleKeyDown = (event: TimelineKeyboardEvent) => {
    if (!canSeek) return;
    const key = event.key.toLowerCase();
    if (!["arrowleft", "arrowright", "home", "end"].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "home") {
      if (isPositionSeekable(0)) onSeekTo(0);
    } else if (key === "end") {
      if (isPositionSeekable(safeDuration)) onSeekTo(safeDuration);
    } else {
      const delta =
        key === "arrowright" ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS;
      const target = clampTimelinePosition(
        safeCurrentTime + delta,
        safeDuration,
      );
      if (isPositionSeekable(target)) {
        onSeekBy?.(delta);
      }
    }
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container}>
      {visiblePreview !== null ? (
        <View
          testID="player-timeline-preview"
          style={[
            styles.preview,
            getPointerEventsStyle("none"),
            width > 0 && {
              left: `${Math.min(
                100,
                Math.max(0, (visiblePreview / safeDuration) * 100),
              )}%`,
            },
          ]}
          pointerEvents={getNativePointerEvents("none")}
        >
          {thumbnailSource ? (
            <Image
              source={thumbnailSource as any}
              style={styles.previewImage}
              contentFit="cover"
              transition={0}
            />
          ) : null}
          <Text style={styles.previewTime}>
            {formatTimelineTime(visiblePreview)}
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text testID="player-timeline-current-time" style={styles.timeText}>
          {currentLabel}
        </Text>
        <GestureDetector gesture={panGesture}>
          <View
            testID="player-progress-slider"
            style={[
              styles.slider,
              Platform.OS === "web" &&
                isFocused &&
                getWebFocusStyle(focusColor),
            ]}
            focusable={canSeek}
            accessibilityRole="adjustable"
            accessibilityLabel={progressLabel}
            accessibilityState={{ disabled: !canSeek }}
            accessibilityValue={{
              min: 0,
              max: safeDuration,
              now: safeCurrentTime,
              text: canSeek
                ? `${currentLabel} of ${durationLabel}`
                : unavailableMessage,
            }}
            accessibilityActions={
              canSeek
                ? [
                    { name: "decrement", label: "Seek back 10 seconds" },
                    { name: "increment", label: "Seek forward 10 seconds" },
                  ]
                : []
            }
            onAccessibilityAction={(event) => {
              if (!canSeek) return;
              const delta =
                event.nativeEvent.actionName === "increment"
                  ? SEEK_STEP_SECONDS
                  : -SEEK_STEP_SECONDS;
              const target = clampTimelinePosition(
                safeCurrentTime + delta,
                safeDuration,
              );
              if (isPositionSeekable(target)) onSeekBy?.(delta);
            }}
            onLayout={handleLayout}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...({
              tabIndex: canSeek ? 0 : -1,
              ...(Platform.OS === "web" ? { "aria-disabled": !canSeek } : {}),
              onKeyDown: handleKeyDown,
              onPointerMove: handlePointerMove,
              onPointerLeave: () => {
                setHoverPosition(null);
                setThumbnailSource(null);
                thumbnailRequestRef.current += 1;
              },
            } as any)}
          >
            <View style={[styles.track, timelineActive && styles.trackActive]}>
              {seekableSegments.map((range, index) => (
                <View
                  key={`seekable-${index}`}
                  testID={
                    seekableOnRequest
                      ? "player-timeline-seekable-on-request"
                      : `player-timeline-seekable-${index}`
                  }
                  style={[
                    styles.seekable,
                    { left: `${range.left}%`, width: `${range.width}%` },
                  ]}
                />
              ))}
              {bufferedSegments.map((range, index) => (
                <View
                  key={`buffered-${index}`}
                  testID={
                    index === 0
                      ? "player-timeline-buffered"
                      : `player-timeline-buffered-${index}`
                  }
                  style={[
                    styles.buffered,
                    { left: `${range.left}%`, width: `${range.width}%` },
                  ]}
                />
              ))}
              <View
                testID="player-timeline-watched"
                style={[
                  styles.watched,
                  { width: `${watchedPercent}%`, backgroundColor: accent },
                ]}
              />
              {canSeek ? (
                <View
                  testID="player-timeline-playhead"
                  style={[
                    styles.playhead,
                    timelineActive && styles.playheadActive,
                    { left: `${watchedPercent}%` },
                  ]}
                />
              ) : null}
            </View>
          </View>
        </GestureDetector>
        <Text style={styles.timeText}>{durationLabel}</Text>
      </View>

      {!canSeek && unavailableMessage ? (
        <Text style={styles.unavailable}>{unavailableMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    minHeight: 38,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  timeText: {
    color: playerChrome.text,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    minWidth: 38,
    textAlign: "center",
  },
  slider: {
    flex: 1,
    minHeight: 34,
    justifyContent: "center",
    borderRadius: uiRadii.pill,
  },
  track: {
    height: 4,
    borderRadius: uiRadii.pill,
    backgroundColor: playerChrome.track,
    overflow: "visible",
  },
  trackActive: { height: 6 },
  seekable: {
    ...StyleSheet.absoluteFill,
    right: undefined,
    borderRadius: uiRadii.pill,
    backgroundColor: "rgba(91,158,255,0.4)",
  },
  buffered: {
    ...StyleSheet.absoluteFill,
    right: undefined,
    borderRadius: uiRadii.pill,
    backgroundColor: "rgba(244,245,247,0.62)",
  },
  watched: {
    ...StyleSheet.absoluteFill,
    right: undefined,
    borderRadius: uiRadii.pill,
    backgroundColor: playerChrome.accent,
  },
  playhead: {
    position: "absolute",
    width: 12,
    height: 12,
    top: -4,
    marginLeft: -6,
    borderRadius: uiRadii.pill,
    backgroundColor: playerChrome.text,
    borderWidth: 1,
    borderColor: "rgba(8,9,12,0.48)",
  },
  playheadActive: {
    width: 16,
    height: 16,
    top: -5,
    marginLeft: -8,
  },
  preview: {
    position: "absolute",
    bottom: 36,
    width: 170,
    marginLeft: -85,
    padding: 4,
    borderRadius: uiRadii.control,
    backgroundColor: playerChrome.surfaceStrong,
    borderWidth: 1,
    borderColor: playerChrome.borderStrong,
    alignItems: "center",
    overflow: "hidden",
  },
  previewImage: {
    width: 160,
    height: 90,
    borderRadius: Math.max(4, uiRadii.control - 3),
  },
  previewTime: {
    color: playerChrome.text,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    paddingVertical: 3,
  },
  unavailable: {
    color: playerChrome.textMuted,
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
});
