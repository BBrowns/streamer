import React, { memo, useEffect } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import Animated, { FadeIn } from "react-native-reanimated";
import { WatchProgressBar } from "../ui/WatchProgressBar";
import { hapticImpactLight } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

const isWeb = Platform.OS === "web";
const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

function CatalogCardInner({
  item,
  isFocused,
  onEnter,
}: {
  item: MetaPreview;
  isFocused?: boolean;
  onEnter?: () => void;
}) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [imageError, setImageError] = React.useState(!item.poster);

  const handlePress = () => {
    hapticImpactLight();
    router.push(`/detail/${item.type}/${item.id}`);
  };

  useEffect(() => {
    if (isFocused && onEnter) {
      // Allow parent to trigger navigation on Enter
    }
  }, [isFocused, onEnter]);

  return (
    <Pressable
      // @ts-ignore web-only
      {...({ dataSet: { catalogCard: true } } as any)}
      style={({ hovered, pressed }: any) => [
        styles.cardContainer,
        { backgroundColor: colors.card, borderColor: colors.border },
        isWeb && (hovered || isFocused) && styles.cardHovered,
        isWeb && (hovered || isFocused) && { borderColor: colors.tint },
        pressed && { opacity: 0.9 },
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      accessibilityHint={
        item.type === "movie"
          ? "Read more about this movie"
          : "View episodes of this series"
      }
    >
      <View style={styles.imageWrapper}>
        {!imageError ? (
          <AnimatedExpoImage
            source={item.poster}
            style={styles.cardImage}
            transition={300}
            contentFit="cover"
            cachePolicy="memory-disk"
            // @ts-ignore
            sharedTransitionTag={`poster-${item.id}`}
            entering={FadeIn.duration(300)}
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={[styles.cardImage, styles.imageFallback]}>
            <Text style={styles.fallbackTitle} numberOfLines={3}>
              {item.name}
            </Text>
          </View>
        )}
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
                <Text style={styles.hoverRating}>{item.imdbRating} IMDb</Text>
              )}
              <View
                style={[styles.hoverPlayBtn, { backgroundColor: colors.tint }]}
              >
                <Ionicons
                  name="play"
                  size={12}
                  color={isDark ? "#2c1738" : "#fff"}
                />
                <Text
                  style={[
                    styles.hoverPlayText,
                    { color: isDark ? "#2c1738" : "#fff" },
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
            {item.imdbRating} IMDb
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
    shadowColor: "#a78bfa",
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
  imageFallback: {
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    backgroundColor: "rgba(216, 180, 254, 0.12)",
  },
  fallbackTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7b6a88",
    textAlign: "center",
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
    backgroundColor: "rgba(17,18,28,0.78)",
    padding: 12,
    justifyContent: "flex-end",
    gap: 4,
  },
  hoverBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  hoverTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  hoverRating: {
    color: "#ffd9a8",
    fontSize: 11,
    fontWeight: "700",
  },
  hoverPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
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
    letterSpacing: 0,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
