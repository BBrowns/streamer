import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  useCinematicTheme,
  useCinematicThemeSource,
} from "../../contexts/CinematicThemeContext";
import { useWindowClass } from "../../hooks/useWindowClass";
import type { CinematicThemeSource } from "../../services/cinematicTheme";
import { MediaArtwork } from "./MediaArtwork";
import { DynamicScrim } from "./DynamicScrim";
import { uiSpacing } from "./designSystem";

export type AmbientHeroArtworkMode =
  "backdrop" | "contained-poster" | "ambient";

export function getAmbientHeroArtworkMode({
  backgroundUri,
  posterUri,
}: Pick<
  CinematicThemeSource,
  "backgroundUri" | "posterUri"
>): AmbientHeroArtworkMode {
  if (backgroundUri?.trim()) return "backdrop";
  if (posterUri?.trim()) return "contained-poster";
  return "ambient";
}

export function AmbientHero({
  source,
  title,
  children,
  testID = "ambient-hero",
}: {
  source: CinematicThemeSource;
  title: string;
  children: ReactNode;
  testID?: string;
}) {
  useCinematicThemeSource(source);
  const { theme } = useCinematicTheme();
  const { isCompact, isMedium, isExpanded, height } = useWindowClass();
  const artworkMode = getAmbientHeroArtworkMode(source);
  const heroHeight = isCompact
    ? Math.max(420, Math.min(520, height * 0.62))
    : isMedium
      ? 500
      : isExpanded
        ? Math.max(520, Math.min(680, height * 0.64))
        : Math.max(560, Math.min(760, height * 0.64));

  return (
    <View
      testID={testID}
      style={[
        styles.hero,
        { height: heroHeight, backgroundColor: theme.ambient },
        Platform.OS === "web" && styles.webThemeTransition,
      ]}
      accessibilityLabel={title}
    >
      <LinearGradient
        colors={[theme.ambient, theme.ambientMuted, "#08090B"]}
        locations={[0, 0.52, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.fill}
      />

      {artworkMode === "backdrop" ? (
        <MediaArtwork
          testID={`${testID}-backdrop`}
          uri={source.backgroundUri}
          variant="backdrop"
          accessible={false}
          contentFit="cover"
          style={styles.backdrop}
        />
      ) : null}

      {artworkMode === "contained-poster" ? (
        <View
          testID={`${testID}-contained-poster`}
          style={[
            styles.posterStage,
            isCompact && styles.posterStageCompact,
            Platform.OS !== "web" && { shadowColor: theme.glow },
          ]}
        >
          <MediaArtwork
            uri={source.posterUri}
            variant="poster"
            title={title}
            accessible={false}
            contentFit="contain"
            style={styles.poster}
          />
        </View>
      ) : null}

      <DynamicScrim />
      <View
        style={[
          styles.content,
          isCompact ? styles.contentCompact : styles.contentDesktop,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },
  webThemeTransition: {
    transition: "background-color 240ms ease",
  } as never,
  fill: { ...StyleSheet.absoluteFill },
  backdrop: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  posterStage: {
    position: "absolute",
    right: "10%",
    top: 104,
    bottom: 56,
    aspectRatio: 2 / 3,
    maxWidth: 260,
    elevation: 14,
    ...(Platform.OS === "web"
      ? { filter: "drop-shadow(0 24px 44px rgba(0,0,0,0.42))" }
      : {
          shadowOffset: { width: 0, height: 22 },
          shadowOpacity: 0.42,
          shadowRadius: 36,
        }),
  } as never,
  posterStageCompact: {
    width: 154,
    height: 231,
    right: 20,
    top: 72,
    bottom: undefined,
    opacity: 0.88,
  },
  poster: { width: "100%", height: "100%", backgroundColor: "transparent" },
  content: { ...StyleSheet.absoluteFill, justifyContent: "flex-end" },
  contentCompact: {
    paddingTop: 88,
    paddingHorizontal: uiSpacing.xl,
    paddingBottom: 36,
  },
  contentDesktop: {
    paddingTop: 108,
    paddingHorizontal: "6%",
    paddingBottom: 64,
  },
});
