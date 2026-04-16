import React, { memo, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

function HomeHeroBannerInner({ item }: { item: MetaPreview }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const heroHeight = isDesktop ? 520 : 380;
  const [playHovered, setPlayHovered] = useState(false);
  const [infoHovered, setInfoHovered] = useState(false);
  const isWeb = Platform.OS === "web";

  const handleNavigate = () => router.push(`/detail/${item.type}/${item.id}`);

  return (
    <Pressable
      style={[
        styles.hero,
        { backgroundColor: colors.background, height: heroHeight },
      ]}
      onPress={handleNavigate}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${item.name}`}
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.heroImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />

      {/* Gradient overlay — CSS gradient on web for better quality */}
      {isWeb ? (
        <View
          style={[
            styles.heroGradient,
            {
              // @ts-ignore web-only background
              background:
                "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.1) 100%)",
            },
          ]}
        />
      ) : (
        <View style={styles.heroGradientNative} />
      )}

      <View
        style={[styles.heroContent, isDesktop && styles.heroContentDesktop]}
      >
        {/* Badge */}
        <View
          style={[
            styles.heroBadge,
            {
              backgroundColor: isDark
                ? "rgba(0,242,255,0.15)"
                : "rgba(99,102,241,0.1)",
              borderColor: isDark
                ? "rgba(0,242,255,0.3)"
                : "rgba(99,102,241,0.3)",
            },
          ]}
        >
          <Text
            style={[
              styles.heroBadgeText,
              { color: isDark ? "#00f2ff" : "#6366f1" },
            ]}
          >
            {item.type === "movie" ? "🎬 MOVIE" : "📺 SERIES"}
          </Text>
        </View>

        {/* Title */}
        <Text
          style={[
            styles.heroTitle,
            { color: "#ffffff", fontSize: isDesktop ? 48 : 36 },
          ]}
          numberOfLines={2}
        >
          {item.name}
        </Text>

        {/* Rating */}
        {!!item.imdbRating && (
          <Text style={styles.heroRating}>⭐ {item.imdbRating} IMDb</Text>
        )}

        {/* Description */}
        {!!item.description && (
          <Text
            style={[styles.heroDesc, { color: "rgba(255,255,255,0.85)" }]}
            numberOfLines={isDesktop ? 3 : 2}
          >
            {item.description}
          </Text>
        )}

        {/* Actions */}
        <View style={styles.heroActions}>
          <Pressable
            style={({ pressed }) => [
              styles.heroPlayBtn,
              {
                backgroundColor: playHovered
                  ? isDark
                    ? "#e6dbff"
                    : "#4f46e5"
                  : colors.tint,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            onPress={handleNavigate}
            onPointerEnter={isWeb ? () => setPlayHovered(true) : undefined}
            onPointerLeave={isWeb ? () => setPlayHovered(false) : undefined}
          >
            <Ionicons name="play" size={18} color={isDark ? "#000" : "#fff"} />
            <Text
              style={[styles.heroPlayText, { color: isDark ? "#000" : "#fff" }]}
            >
              Play
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.heroInfoBtn,
              {
                backgroundColor: infoHovered
                  ? "rgba(255,255,255,0.25)"
                  : "rgba(255,255,255,0.15)",
                borderColor: infoHovered
                  ? "rgba(255,255,255,0.4)"
                  : "rgba(255,255,255,0.2)",
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            onPress={handleNavigate}
            onPointerEnter={isWeb ? () => setInfoHovered(true) : undefined}
            onPointerLeave={isWeb ? () => setInfoHovered(false) : undefined}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#fff"
            />
            <Text style={styles.heroInfoText}>More Info</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export const HomeHeroBanner = memo(HomeHeroBannerInner);

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    position: "relative",
    marginBottom: 24,
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  } as any,
  heroGradientNative: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "75%",
    // On native we approximate with a semi-transparent black
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  heroContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 28,
  },
  heroContentDesktop: {
    padding: 48,
    maxWidth: 700,
  },
  heroBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    color: "#fff",
  },
  heroRating: {
    color: "#ffd700",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  heroDesc: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: 560,
  },
  heroActions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  heroPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 10,
    // @ts-ignore web-only
    transition: "background-color 0.15s ease, transform 0.1s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  heroPlayText: {
    fontWeight: "800",
    fontSize: 15,
  },
  heroInfoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    // @ts-ignore web-only
    transition:
      "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  heroInfoText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
