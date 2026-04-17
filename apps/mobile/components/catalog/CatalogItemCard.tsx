import React, { memo } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import Animated from "react-native-reanimated";
import { WatchProgressBar } from "../ui/WatchProgressBar";
import { hapticImpactLight } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";

const isWeb = Platform.OS === "web";

function CatalogCardInner({ item }: { item: MetaPreview }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const handlePress = () => {
    hapticImpactLight();
    router.push(`/detail/${item.type}/${item.id}`);
  };

  return (
    <Pressable
      // @ts-ignore web-only
      {...({ dataSet: { catalogCard: true } } as any)}
      style={({ hovered, pressed }: any) => [
        styles.cardContainer,
        { backgroundColor: colors.card, borderColor: colors.border },
        isWeb && hovered && styles.cardHovered,
        isWeb && hovered && { borderColor: colors.tint },
        pressed && { opacity: 0.9 },
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.imdbRating ? `, rated ${item.imdbRating}` : ""}`}
      accessibilityHint="Opens details page"
    >
      <View style={styles.imageWrapper}>
        <Animated.Image
          source={{ uri: item.poster }}
          style={styles.cardImage}
          sharedTransitionTag={`poster-${item.id}`}
          accessibilityIgnoresInvertColors
        />
        <WatchProgressBar itemId={item.id} />

        {/* CSS-only hover overlay — no React state, no layout shift */}
        {isWeb && (
          // @ts-ignore web-only
          <View
            {...({ dataSet: { hoverOverlay: true } } as any)}
            style={styles.hoverOverlayWrap}
          >
            <View style={styles.hoverOverlayContent}>
              <Text style={[styles.hoverBadgeText, { color: colors.tint }]}>
                {item.type === "movie" ? "MOVIE" : "SERIES"}
              </Text>
              <Text style={styles.hoverTitle} numberOfLines={2}>
                {item.name}
              </Text>
              {!!item.imdbRating && (
                <Text style={styles.hoverRating}>⭐ {item.imdbRating}</Text>
              )}
              <View
                style={[styles.hoverPlayBtn, { backgroundColor: colors.tint }]}
              >
                <Ionicons
                  name="play"
                  size={12}
                  color={isDark ? "#000" : "#fff"}
                />
                <Text
                  style={[
                    styles.hoverPlayText,
                    { color: isDark ? "#000" : "#fff" },
                  ]}
                >
                  Play
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.cardInfo}>
        <Text
          style={[styles.cardTitle, { color: colors.text }]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        {!!item.imdbRating && (
          <Text style={[styles.ratingText, { color: "#fbbf24" }]}>
            ⭐ {item.imdbRating}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export const CatalogItemCard = memo(CatalogCardInner);

const styles = StyleSheet.create({
  cardContainer: {
    width: "100%",
    maxWidth: 220,
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    // @ts-ignore web-only
    transition:
      "transform 0.2s ease, border-color 0.15s ease, box-shadow 0.2s ease",
    cursor: isWeb ? "pointer" : undefined,
  } as any,
  cardHovered: {
    transform: [{ scale: 1.03 }],
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  imageWrapper: {
    position: "relative",
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  // The overlay is always in DOM but hidden via CSS opacity
  hoverOverlayWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    // @ts-ignore web-only
    transition: "opacity 0.2s ease",
    pointerEvents: "none",
  } as any,
  hoverOverlayContent: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    padding: 12,
    justifyContent: "flex-end",
    gap: 4,
  },
  hoverBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  hoverTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  hoverRating: {
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: "700",
  },
  hoverPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  hoverPlayText: {
    fontWeight: "800",
    fontSize: 11,
  },
  cardInfo: {
    padding: 8,
    gap: 3,
  },
  cardTitle: {
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: -0.2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
