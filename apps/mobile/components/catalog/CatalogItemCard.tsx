import React, { memo, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  Platform,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import Animated from "react-native-reanimated";
import { WatchProgressBar } from "../ui/WatchProgressBar";
import { hapticImpactLight } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";

function CatalogCardInner({ item }: { item: MetaPreview }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isWeb = Platform.OS === "web";

  const handlePress = () => {
    hapticImpactLight();
    router.push(`/detail/${item.type}/${item.id}`);
  };

  return (
    <Pressable
      style={({ hovered, pressed }) => [
        styles.cardContainer,
        { backgroundColor: colors.card, borderColor: colors.border },
        isWeb &&
          hovered && {
            transform: [{ scale: 1.04 }],
            borderColor: colors.tint,
            zIndex: 10,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius: 16,
          },
        pressed && { opacity: 0.9 },
      ]}
      onPress={handlePress}
      onPointerEnter={isWeb ? () => setIsHovered(true) : undefined}
      onPointerLeave={isWeb ? () => setIsHovered(false) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.imdbRating ? `, rated ${item.imdbRating}` : ""}`}
      accessibilityHint="Opens details page"
    >
      <View style={{ position: "relative" }}>
        <Animated.Image
          source={{ uri: item.poster }}
          style={styles.cardImage}
          sharedTransitionTag={`poster-${item.id}`}
          accessibilityIgnoresInvertColors
        />
        <WatchProgressBar itemId={item.id} />

        {/* Desktop hover overlay */}
        {isWeb && isHovered && (
          <View
            style={[
              styles.hoverOverlay,
              { backgroundColor: "rgba(0,0,0,0.72)" },
            ]}
          >
            <View style={styles.hoverBadge}>
              <Text style={[styles.hoverBadgeText, { color: colors.tint }]}>
                {item.type === "movie" ? "MOVIE" : "SERIES"}
              </Text>
            </View>
            <Text style={styles.hoverTitle} numberOfLines={2}>
              {item.name}
            </Text>
            {!!item.imdbRating && (
              <Text style={styles.hoverRating}>⭐ {item.imdbRating} IMDb</Text>
            )}
            <Pressable
              style={[styles.hoverPlayBtn, { backgroundColor: colors.tint }]}
              onPress={handlePress}
            >
              <Ionicons
                name="play"
                size={14}
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
            </Pressable>
          </View>
        )}
      </View>

      {/* Card info — hidden on desktop when hovered */}
      {!isHovered && (
        <View style={styles.cardInfo}>
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {!!item.imdbRating && (
            <View style={styles.ratingContainer}>
              <Text style={[styles.ratingText, { color: "#fbbf24" }]}>
                ⭐ {item.imdbRating}
              </Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

export const CatalogItemCard = memo(CatalogCardInner);

const styles = StyleSheet.create({
  cardContainer: {
    width: "100%",
    marginHorizontal: 0,
    marginBottom: 16,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    // @ts-ignore web-only
    transition:
      "transform 0.2s ease, border-color 0.15s ease, box-shadow 0.2s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  // Desktop hover overlay
  hoverOverlay: {
    position: "absolute",
    inset: 0,
    padding: 14,
    justifyContent: "flex-end",
    gap: 6,
  } as any,
  hoverBadge: {
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  hoverBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  hoverTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  hoverRating: {
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: "700",
  },
  hoverPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 4,
    // @ts-ignore web-only
    cursor: "pointer",
  } as any,
  hoverPlayText: {
    fontWeight: "800",
    fontSize: 12,
  },
  // Card info
  cardInfo: { padding: 10 },
  cardTitle: {
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: -0.3,
  },
  ratingContainer: { marginTop: 4 },
  ratingText: { fontSize: 12, fontWeight: "800" },
});
