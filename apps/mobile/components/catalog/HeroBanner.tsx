import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import type { MetaPreview, CatalogDefinition } from "@streamer/shared";
import { hapticImpactLight } from "../../lib/haptics";

const { width, height } = Dimensions.get("window");
const HERO_HEIGHT = height * 0.65; // Take up 65% of the screen height

function HeroBannerInner({ catalog }: { catalog?: CatalogDefinition }) {
  const router = useRouter();
  const { data } = useAddonCatalog(catalog?.type || "");

  if (!catalog || !data || data.length === 0) {
    return null;
  }

  // Feature the very first item from this catalog
  const featuredItem = data[0];

  const handlePress = () => {
    hapticImpactLight();
    router.push(`/detail/${featuredItem.type}/${featuredItem.id}`);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handlePress} style={styles.pressable}>
        <Image
          source={{ uri: featuredItem.background || featuredItem.poster }}
          style={styles.image}
          resizeMode="cover"
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.6)", "#000000"]}
          locations={[0.4, 0.8, 1]}
          style={styles.gradient}
        >
          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={2}>
              {featuredItem.name}
            </Text>
            {!!featuredItem.description && (
              <Text style={styles.description} numberOfLines={3}>
                {featuredItem.description}
              </Text>
            )}
            <View style={styles.buttonRow}>
              <View style={styles.playButton} pointerEvents="none">
                <Text style={styles.playButtonText}>▶ Play</Text>
              </View>
              <View style={styles.infoButton} pointerEvents="none">
                <Text style={styles.infoButtonText}>ⓘ Info</Text>
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
    backgroundColor: "#000000",
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
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
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
    gap: 16,
    justifyContent: "center",
    width: "100%",
  },
  playButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  playButtonText: {
    color: "#000000",
    fontWeight: "800",
    fontSize: 16,
  },
  infoButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  infoButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
});
