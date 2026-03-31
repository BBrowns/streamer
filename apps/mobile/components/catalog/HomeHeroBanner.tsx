import React, { memo } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import { Ionicons } from "@expo/vector-icons";

function HomeHeroBannerInner({ item }: { item: MetaPreview }) {
  const router = useRouter();

  return (
    <Pressable
      style={styles.hero}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${item.name}`}
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.heroImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View style={styles.heroGradient} />
      <View style={styles.heroContent}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>
            {item.type === "movie" ? "🎬 MOVIE" : "📺 SERIES"}
          </Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {item.name}
        </Text>
        {!!item.imdbRating && (
          <Text style={styles.heroRating}>⭐ {item.imdbRating} IMDb</Text>
        )}
        {!!item.description && (
          <Text style={styles.heroDesc} numberOfLines={3}>
            {item.description}
          </Text>
        )}
        <View style={styles.heroActions}>
          <Pressable
            style={styles.heroPlayBtn}
            onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
          >
            <Ionicons name="play" size={18} color="#000" />
            <Text style={styles.heroPlayText}>Play</Text>
          </Pressable>
          <Pressable
            style={styles.heroInfoBtn}
            onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
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
    height: 420,
    position: "relative",
    marginBottom: 24,
    backgroundColor: "#111",
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
    height: "80%",
    backgroundColor: "transparent",
  },
  heroContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 32,
  },
  heroBadge: {
    backgroundColor: "rgba(0,242,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(0,242,255,0.3)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  heroBadgeText: {
    color: "#00f2ff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroRating: {
    color: "#ffd700",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  heroDesc: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    lineHeight: 20,
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
    backgroundColor: "#00f2ff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  heroPlayText: {
    color: "#000",
    fontWeight: "800",
    fontSize: 15,
  },
  heroInfoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heroInfoText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
