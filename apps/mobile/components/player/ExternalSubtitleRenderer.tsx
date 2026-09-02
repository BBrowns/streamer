import React, { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  SubtitleBackground,
  SubtitleFontFamily,
  SubtitleTextSize,
  SubtitleVerticalPosition,
} from "../../stores/playerStore";
import {
  applySubtitleOffset,
  cuesAtTime,
  type SubtitleCue,
} from "../../services/playback/SubtitleParser";
import {
  getNativePointerEvents,
  getPointerEventsStyle,
} from "../../lib/platformStyles";

interface ExternalSubtitleRendererProps {
  cues: SubtitleCue[];
  currentTime: number;
  offsetSeconds: number;
  textSize: SubtitleTextSize;
  background: SubtitleBackground;
  backgroundOpacity: number;
  verticalPosition: SubtitleVerticalPosition;
  fontFamily: SubtitleFontFamily;
  controlsVisible: boolean;
}

const fontSizes: Record<SubtitleTextSize, number> = {
  small: 16,
  medium: 21,
  large: 28,
};
const shadowStyle =
  Platform.OS === "web"
    ? ({ textShadow: "0 2px 4px rgba(0, 0, 0, 0.98)" } as const)
    : ({
        textShadowColor: "rgba(0, 0, 0, 0.98)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
      } as const);

export function ExternalSubtitleRenderer({
  cues,
  currentTime,
  offsetSeconds,
  textSize,
  background,
  backgroundOpacity,
  verticalPosition,
  fontFamily,
  controlsVisible,
}: ExternalSubtitleRendererProps) {
  const insets = useSafeAreaInsets();
  const offsetCues = useMemo(
    () => applySubtitleOffset(cues, offsetSeconds),
    [cues, offsetSeconds],
  );
  const activeCues = cuesAtTime(offsetCues, currentTime).slice(0, 3);
  const fontSize = fontSizes[textSize];
  const bottom =
    verticalPosition === "high"
      ? "58%"
      : verticalPosition === "middle"
        ? "38%"
        : insets.bottom + (controlsVisible ? 142 : 28);
  const resolvedFontFamily = fontFamily === "system" ? undefined : fontFamily;
  const normalizedBackgroundOpacity = Math.max(
    0,
    Math.min(1, backgroundOpacity),
  );

  if (activeCues.length === 0) return null;

  return (
    <View
      pointerEvents={getNativePointerEvents("none")}
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        getPointerEventsStyle("none"),
        {
          bottom,
        },
      ]}
    >
      {activeCues.map((cue) => (
        <View
          key={cue.id}
          testID="external-subtitle-cue"
          style={[
            styles.cue,
            background === "box" && {
              backgroundColor: `rgba(0, 0, 0, ${normalizedBackgroundOpacity})`,
            },
          ]}
        >
          <Text
            style={[
              styles.text,
              {
                fontSize,
                lineHeight: Math.round(fontSize * 1.35),
                fontFamily: resolvedFontFamily,
              },
              background === "shadow" && shadowStyle,
            ]}
          >
            {cue.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: "7%",
    right: "7%",
    zIndex: 16,
    alignItems: "center",
  },
  cue: {
    maxWidth: "100%",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 3,
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "600",
    textAlign: "center",
  },
});
