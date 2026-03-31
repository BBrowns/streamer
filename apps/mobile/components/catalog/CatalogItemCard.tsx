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

function CatalogCardInner({ item }: { item: MetaPreview }) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const isWeb = Platform.OS === "web";

  return (
    <Pressable
      style={[
        styles.cardContainer,
        isWeb && isHovered && styles.cardContainerHovered,
      ]}
      onPress={() => {
        hapticImpactLight();
        router.push(`/detail/${item.type}/${item.id}`);
      }}
      onPointerEnter={isWeb ? () => setIsHovered(true) : undefined}
      onPointerLeave={isWeb ? () => setIsHovered(false) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.imdbRating ? `, rated ${item.imdbRating}` : ""}`}
      accessibilityHint="Opens details page"
    >
      <View style={{ position: "relative" }}>
        <Animated.Image
          source={{ uri: item.poster }}
          style={[
            styles.cardImage,
            isWeb && isHovered && (styles.cardImageHovered as any),
          ]}
          sharedTransitionTag={`poster-${item.id}`}
          accessibilityIgnoresInvertColors
        />
        <WatchProgressBar itemId={item.id} />
      </View>
      <View style={styles.cardInfo}>
        <Text
          style={[
            styles.cardTitle,
            isWeb && isHovered && styles.cardTitleHovered,
          ]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        {!!item.imdbRating && (
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingText}>⭐ {item.imdbRating}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const CatalogItemCard = memo(CatalogCardInner);

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    maxWidth: 240,
    marginHorizontal: 6,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111118",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardContainerHovered: {
    borderColor: "#00f2ff",
    transform: [{ scale: 1.05 }],
    zIndex: 10,
    boxShadow: "0 10px 30px rgba(0, 242, 255, 0.25)",
  } as any,
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(255,255,255,0.05)",
    transition: "all 0.4s cubic-bezier(0.2, 1, 0.3, 1)",
  } as any,
  cardImageHovered: {
    filter: "brightness(1.15) contrast(1.05)",
  },
  cardInfo: { padding: 8 },
  cardTitle: {
    color: "#f1f5f9",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: -0.2,
    transition: "color 0.2s ease",
  } as any,
  cardTitleHovered: {
    color: "#00f2ff",
  },
  ratingContainer: { marginTop: 4 },
  ratingText: { color: "#ffd600", fontSize: 11, fontWeight: "800" },
});
