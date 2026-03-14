import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import type { MetaPreview, CatalogDefinition } from "@streamer/shared";
import { hapticImpactLight } from "../../lib/haptics";
import { Button } from "../ui/Button";
import { Theme } from "../../constants/DesignSystem";

const { width, height } = Dimensions.get("window");
const HERO_HEIGHT = height * 0.65; // Take up 65% of the screen height

function HeroBannerInner({ catalog }: { catalog?: CatalogDefinition }) {
  const router = useRouter();
  const { data } = useAddonCatalog(catalog?.type || "", catalog?.id || "");

  if (!catalog || !data || data.length === 0) {
    return null;
  }

  // Feature the very first item from this catalog
  const featuredItem = data[0];

  const handlePlay = () => {
    hapticImpactLight();
    router.push(
      `/detail/${featuredItem.type}/${featuredItem.id}?autoplay=true`,
    );
  };

  const handleInfo = () => {
    hapticImpactLight();
    router.push(`/detail/${featuredItem.type}/${featuredItem.id}`);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handleInfo} style={styles.pressable}>
        <Image
          source={{ uri: featuredItem.poster }}
          style={styles.image}
          resizeMode="cover"
        />
        <LinearGradient
          colors={["transparent", "rgba(1,1,1,0.4)", "#010101"]}
          locations={[0.2, 0.6, 1]}
          style={styles.gradient}
        >
          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={2}>
              {featuredItem.name}
            </Text>
            {featuredItem.imdbRating && (
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={14} color="#ffd600" />
                <Text style={styles.ratingText}>{featuredItem.imdbRating}</Text>
              </View>
            )}
            {!!featuredItem.description && (
              <Text style={styles.description} numberOfLines={3}>
                {featuredItem.description}
              </Text>
            )}
            <View style={styles.buttonRow}>
              <View style={styles.buttonWrapper}>
                <Button
                  title="▶ Play"
                  onPress={handlePlay}
                  size="lg"
                  style={styles.heroButton}
                />
              </View>
              <View style={styles.buttonWrapper}>
                <Button
                  title="ⓘ Info"
                  onPress={handleInfo}
                  variant="ghost"
                  size="lg"
                  style={styles.heroButton}
                />
              </View>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export const HeroBanner = memo(HeroBannerInner);

const styles = StyleSheet.create({
  container: {
    width,
    height: HERO_HEIGHT,
    backgroundColor: "#010101",
  },
  pressable: {
    flex: 1,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  content: {
    padding: 24,
    paddingBottom: 40,
    alignItems: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 36,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
    // @ts-ignore - textShadow shorthand is recently added/web-compatible
    textShadow: "0 2 4 rgba(0,0,0,0.5)",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  ratingText: {
    color: "#ffd600",
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 4,
  },
  description: {
    color: "#e5e5e5",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
    maxWidth: "90%",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    width: "100%",
    maxWidth: 500, // Prevent buttons from becoming too wide on large screens
  },
  buttonWrapper: {
    flex: 1,
  },
  heroButton: {
    width: "100%",
  },
});
