import React, { type ReactNode, useEffect, useState } from "react";
import {
  AccessibilityRole,
  AccessibilityState,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "./designSystem";

type PosterCardProps = {
  title: string;
  poster?: string | null;
  eyebrow?: string;
  metadata?: string;
  rating?: string | number | null;
  progress?: number;
  mediaOverlay?: ReactNode;
  selected?: boolean;
  onPress: () => void;
  onActivate?: () => void;
  onLongPress?: () => void;
  onContextMenu?: (event: any) => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function PosterCard({
  title,
  poster,
  eyebrow,
  metadata,
  rating,
  progress,
  mediaOverlay,
  selected = false,
  onPress,
  onActivate,
  onLongPress,
  onContextMenu,
  accessibilityRole = "button",
  accessibilityState,
  accessibilityHint,
  testID,
  style,
}: PosterCardProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const posterUri = typeof poster === "string" ? poster.trim() : "";
  const [imageError, setImageError] = useState(!posterUri);
  const { isKeyboardFocused, webPressableProps } = useWebPressableActivation(
    onActivate ?? onPress,
  );

  useEffect(() => setImageError(!posterUri), [posterUri]);

  return (
    <Pressable
      // @ts-ignore web-only catalog targeting
      {...({ dataSet: { catalogCard: true } } as any)}
      {...webPressableProps}
      onPress={onPress}
      onLongPress={onLongPress}
      // @ts-ignore web-only context menu
      onContextMenu={Platform.OS === "web" ? onContextMenu : undefined}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState ?? { selected }}
      testID={testID}
      style={({ hovered, pressed, focused }: any) => [
        styles.card,
        !reducedMotion && styles.motion,
        (hovered || isKeyboardFocused) && styles.cardRaised,
        pressed && styles.cardPressed,
        selected && { backgroundColor: colors.tint + "12" },
        Platform.OS === "web" &&
          (focused || isKeyboardFocused) &&
          getWebFocusStyle(colors.focus),
        style,
      ]}
    >
      <View
        style={[
          styles.posterFrame,
          { backgroundColor: colors.surfaceElevated },
        ]}
      >
        {!imageError && posterUri ? (
          <Image
            source={{ uri: posterUri }}
            style={styles.poster}
            transition={reducedMotion ? 0 : 180}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={`${title} poster`}
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.fallback}>
            <Ionicons name="film-outline" size={28} color={colors.tint} />
            <Text
              numberOfLines={3}
              style={[styles.fallbackTitle, { color: colors.textSecondary }]}
            >
              {title}
            </Text>
          </View>
        )}

        {mediaOverlay}

        {typeof progress === "number" ? (
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: isDark ? "#30343C" : "#D3D2CE" },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.tint,
                  width: `${Math.min(100, Math.max(0, progress))}%`,
                },
              ]}
            />
          </View>
        ) : null}

        {selected ? (
          <View
            style={[styles.selectedBadge, { backgroundColor: colors.tint }]}
          >
            <Ionicons name="checkmark" size={15} color={colors.onTint} />
          </View>
        ) : null}
      </View>

      <View style={styles.copy}>
        {eyebrow ? (
          <Text
            numberOfLines={1}
            style={[styles.eyebrow, { color: colors.textSecondary }]}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
        {metadata || rating ? (
          <View style={styles.metaRow}>
            {metadata ? (
              <Text
                numberOfLines={1}
                style={[styles.metadata, { color: colors.textSecondary }]}
              >
                {metadata}
              </Text>
            ) : null}
            {rating ? (
              <View style={styles.rating}>
                <Ionicons name="star" size={11} color={colors.warning} />
                <Text
                  style={[styles.ratingText, { color: colors.textSecondary }]}
                >
                  {rating}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 240,
    borderRadius: uiRadii.card,
    paddingBottom: uiSpacing.sm,
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  motion: {
    // @ts-ignore web-only
    transition: "transform 0.18s ease, opacity 0.12s ease",
  } as any,
  cardRaised: {
    transform: [{ translateY: -3 }],
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  posterFrame: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: uiRadii.card,
    overflow: "hidden",
  },
  poster: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: uiSpacing.md,
    padding: uiSpacing.lg,
  },
  fallbackTitle: {
    ...uiTypography.label,
    textAlign: "center",
  },
  selectedBadge: {
    position: "absolute",
    top: uiSpacing.sm,
    right: uiSpacing.sm,
    width: 28,
    height: 28,
    borderRadius: uiRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
  },
  progressFill: {
    height: "100%",
  },
  copy: {
    paddingTop: uiSpacing.sm,
    gap: uiSpacing.xxs,
  },
  eyebrow: {
    ...uiTypography.caption,
    textTransform: "uppercase",
    fontSize: 10,
  },
  title: {
    ...uiTypography.label,
    color: "#FFFFFF",
  },
  metaRow: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  metadata: {
    ...uiTypography.caption,
    flexShrink: 1,
  },
  rating: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.xs,
  },
  ratingText: {
    ...uiTypography.caption,
  },
});
