import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../hooks/useTheme";
import { useCinematicTheme } from "../../contexts/CinematicThemeContext";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useWindowClass } from "../../hooks/useWindowClass";
import { MediaArtwork } from "./MediaArtwork";
import { AdaptiveOverlay } from "./AdaptiveOverlay";
import {
  getWebFocusStyle,
  getWebMediaFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "./designSystem";

export function getContinueWatchingArtworkMode({
  background,
  poster,
}: {
  background?: string | null;
  poster?: string | null;
}) {
  if (background?.trim()) return "backdrop" as const;
  if (poster?.trim()) return "contained-poster" as const;
  return "ambient" as const;
}

export function shouldShowContinueWatchingQuickActions({
  platform,
  isCompact,
  hovered,
  focused,
}: {
  platform: string;
  isCompact: boolean;
  hovered: boolean;
  focused: boolean;
}) {
  return platform !== "web" || isCompact || hovered || focused;
}

export function ContinueWatchingCard({
  title,
  background,
  poster,
  kicker,
  metadata,
  progress,
  resumeAccessibilityLabel,
  resuming,
  removing,
  onOpen,
  onResume,
  onRemove,
}: {
  title: string;
  background?: string | null;
  poster?: string | null;
  kicker: string;
  metadata: string;
  progress?: number;
  resumeAccessibilityLabel?: string;
  resuming?: boolean;
  removing?: boolean;
  onOpen: () => void;
  onResume: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const { theme: cinematicTheme } = useCinematicTheme();
  const reducedMotion = useReducedMotion();
  const { isCompact } = useWindowClass();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hasActionFocus, setHasActionFocus] = useState(false);
  const artworkMode = getContinueWatchingArtworkMode({ background, poster });
  const quickActionsVisible = shouldShowContinueWatchingQuickActions({
    platform: Platform.OS,
    isCompact,
    hovered: isHovered,
    focused: hasActionFocus,
  });

  return (
    <View
      testID="continue-watching-card"
      {...({ dataSet: { continueCard: true } } as any)}
      {...({
        onPointerEnter: () => setIsHovered(true),
        onPointerLeave: () => setIsHovered(false),
        onFocusCapture: () => setHasActionFocus(true),
        onBlurCapture: (event: any) => {
          const currentTarget = event.currentTarget as
            | (EventTarget & {
                contains?: (target: EventTarget | null) => boolean;
              })
            | null;
          const relatedTarget =
            event.relatedTarget ?? event.nativeEvent?.relatedTarget;
          if (currentTarget?.contains?.(relatedTarget)) return;
          setHasActionFocus(false);
        },
      } as any)}
      style={styles.card}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View Details: ${title}`}
        onPress={onOpen}
        style={({ hovered, pressed, focused }: any) => [
          styles.openArea,
          !reducedMotion && styles.motion,
          hovered && !reducedMotion && styles.hovered,
          pressed && styles.pressed,
          Platform.OS === "web" &&
            focused &&
            getWebMediaFocusStyle(cinematicTheme.focus),
        ]}
      >
        <View
          testID="continue-watching-artwork"
          style={[styles.artwork, { backgroundColor: colors.surfaceElevated }]}
        >
          {artworkMode === "backdrop" ? (
            <MediaArtwork
              testID="continue-watching-backdrop"
              uri={background}
              variant="backdrop"
              title={title}
              accessible={false}
              style={styles.fill}
            />
          ) : artworkMode === "contained-poster" ? (
            <View
              testID="continue-watching-contained-poster"
              style={[
                styles.posterFallback,
                { backgroundColor: cinematicTheme.ambientMuted },
              ]}
            >
              <View
                style={[
                  styles.posterGlow,
                  { backgroundColor: cinematicTheme.accentSoft },
                ]}
              />
              <MediaArtwork
                testID="continue-watching-contained-poster-artwork"
                uri={poster}
                variant="poster"
                title={title}
                accessible={false}
                contentFit="contain"
                style={styles.containedPoster}
              />
            </View>
          ) : (
            <LinearGradient
              testID="continue-watching-ambient-fallback"
              colors={[colors.surfaceElevated, colors.card, colors.background]}
              style={styles.fill}
            />
          )}
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(8,9,11,0)", "rgba(8,9,11,0.38)"]}
            style={styles.fill}
          />
          {typeof progress === "number" ? (
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: "rgba(255,255,255,0.22)" },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(0, Math.min(100, progress))}%`,
                    backgroundColor: cinematicTheme.progress,
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.copy}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: colors.text }]}
          >
            {title}
          </Text>
          <View style={styles.metadataRow}>
            <Text
              numberOfLines={1}
              style={[styles.metadata, { color: colors.textSecondary }]}
            >
              {kicker}
            </Text>
            <Text
              accessibilityElementsHidden
              style={[styles.metaDivider, { color: colors.textTertiary }]}
            >
              ·
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.metadata,
                styles.metadataValue,
                { color: colors.textSecondary },
              ]}
            >
              {metadata}
            </Text>
          </View>
        </View>
      </Pressable>

      <View
        {...({ dataSet: { cardQuickActions: true } } as any)}
        testID="continue-watching-quick-actions"
        pointerEvents={quickActionsVisible ? "auto" : "none"}
        style={[
          styles.quickActions,
          !reducedMotion && styles.quickActionsMotion,
          !quickActionsVisible && styles.quickActionsHidden,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={resumeAccessibilityLabel ?? `Resume ${title}`}
          accessibilityState={{ busy: resuming }}
          disabled={resuming}
          onPress={onResume}
          style={({ pressed, focused }: any) => [
            styles.quickButton,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.72 },
            Platform.OS === "web" &&
              focused &&
              getWebFocusStyle(cinematicTheme.focus),
          ]}
        >
          <Ionicons name="play" size={16} color={colors.onPrimary} />
          <Text style={[styles.quickLabel, { color: colors.onPrimary }]}>
            Resume
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${title}`}
          onPress={() => setMenuOpen(true)}
          style={({ pressed, focused }: any) => [
            styles.moreButton,
            {
              backgroundColor: "rgba(8,9,11,0.78)",
              borderColor: "rgba(255,255,255,0.18)",
            },
            pressed && { opacity: 0.7 },
            Platform.OS === "web" &&
              focused &&
              getWebFocusStyle(cinematicTheme.focus),
          ]}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color="#F4F2EE" />
        </Pressable>
      </View>

      <AdaptiveOverlay
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        accessibilityLabel={`Actions for ${title}`}
        contentStyle={styles.menu}
      >
        <Text
          style={[styles.menuTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <MenuAction
          icon="information-circle-outline"
          label="View Details"
          onPress={() => {
            setMenuOpen(false);
            onOpen();
          }}
        />
        <MenuAction
          icon="close-circle-outline"
          label={`Remove ${title} from Continue Watching`}
          destructive
          disabled={removing}
          onPress={() => {
            setMenuOpen(false);
            onRemove();
          }}
        />
      </AdaptiveOverlay>
    </View>
  );
}

function MenuAction({
  icon,
  label,
  onPress,
  destructive,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.error : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed, focused }: any) => [
        styles.menuAction,
        hovered && { backgroundColor: colors.stateHover },
        pressed && { backgroundColor: colors.statePressed },
        disabled && { opacity: 0.46 },
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.menuActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", position: "relative" },
  openArea: { borderRadius: uiRadii.card },
  motion: { transition: "transform 140ms ease, opacity 90ms ease" } as never,
  hovered: { transform: [{ scale: 1.025 }] },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.82 },
  artwork: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: uiRadii.card,
    overflow: "hidden",
  },
  fill: { ...StyleSheet.absoluteFill },
  posterFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 12,
  },
  posterGlow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "62%",
    opacity: 0.58,
  },
  containedPoster: {
    height: "88%",
    aspectRatio: 2 / 3,
    borderRadius: uiRadii.xs,
    overflow: "hidden",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
  },
  progressFill: { height: 4 },
  copy: { paddingTop: uiSpacing.sm, minHeight: 52, gap: uiSpacing.xxs },
  title: { ...uiTypography.label, fontSize: 14, lineHeight: 20 },
  metadata: { ...uiTypography.caption },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.xs,
  },
  metadataValue: { flex: 1 },
  metaDivider: { ...uiTypography.caption },
  quickActions: {
    position: "absolute",
    right: 10,
    top: 10,
    flexDirection: "row",
    gap: 6,
  },
  quickActionsMotion: {
    transition: "opacity 90ms ease, transform 140ms ease",
  } as never,
  quickActionsHidden: {
    opacity: 0,
    transform: [{ translateY: -3 }],
  },
  quickButton: {
    minHeight: uiTouchTarget,
    borderRadius: uiRadii.pill,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quickLabel: { ...uiTypography.label, fontSize: 12 },
  moreButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: { width: 340, paddingVertical: 10 },
  menuTitle: {
    ...uiTypography.control,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  menuAction: {
    minHeight: 48,
    marginHorizontal: 8,
    paddingHorizontal: 12,
    borderRadius: uiRadii.control,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuActionText: { ...uiTypography.label, flex: 1 },
});
