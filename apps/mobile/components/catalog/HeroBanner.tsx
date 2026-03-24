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
import { Ionicons } from "@expo/vector-icons";

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
            {!!featuredItem.description && (
              <Text style={styles.description} numberOfLines={3}>
                {featuredItem.description}
              </Text>
            )}
            <View style={styles.buttonRow}>
              <View style={styles.playButton} pointerEvents="none">
                <Ionicons name="play" size={18} color="#000" />
                <Text style={styles.playButtonText}>Play</Text>
              </View>
              <View style={styles.infoButton} pointerEvents="none">
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.infoButtonText}>Info</Text>
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
    textShadow: "0px 2px 4px rgba(0,0,0,0.5)",
  } as any,
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
    backgroundColor: "#00f2ff",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playButtonText: {
    color: "#000000",
    fontWeight: "900",
    fontSize: 15,
  },
  infoButton: {
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  infoButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
});
