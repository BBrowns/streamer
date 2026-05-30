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
import type { CatalogDefinition, InstalledAddon } from "@streamer/shared";
import { hapticImpactLight } from "../../lib/haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

const { width, height } = Dimensions.get("window");
const HERO_HEIGHT = height * 0.58;

function HeroBannerInner({
  catalog,
  addon,
}: {
  catalog?: CatalogDefinition;
  addon?: InstalledAddon;
}) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { data } = useAddonCatalog(addon?.id, catalog);
  const flattenedData = data?.pages.flat() || [];

  if (!catalog || flattenedData.length === 0) {
    return null;
  }

  // Feature the very first item from this catalog
  const featuredItem = flattenedData[0];

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
          colors={[
            "transparent",
            isDark ? "rgba(1,1,1,0.4)" : "rgba(255,255,255,0.4)",
            colors.background,
          ]}
          locations={[0.2, 0.6, 1]}
          style={styles.gradient}
        >
          <View style={styles.content}>
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={2}
            >
              {featuredItem.name}
            </Text>
            {!!featuredItem.description && (
              <Text
                style={[styles.description, { color: colors.textSecondary }]}
                numberOfLines={3}
              >
                {featuredItem.description}
              </Text>
            )}
            <View style={styles.buttonRow}>
              <View style={[styles.playButton, { backgroundColor: "#f2d7ff" }]}>
                <Ionicons name="play" size={18} color="#2c1738" />
                <Text style={styles.playButtonText}>Play</Text>
              </View>
              <View
                style={[
                  styles.infoButton,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(0,0,0,0.05)",
                    borderColor: colors.border,
                  },
                ]}
                pointerEvents="none"
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={colors.text}
                />
                <Text style={[styles.infoButtonText, { color: colors.text }]}>
                  Info
                </Text>
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
    backgroundColor: "#15151f",
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
    paddingBottom: 36,
    alignItems: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
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
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playButtonText: {
    color: "#2c1738",
    fontWeight: "900",
    fontSize: 15,
  },
  infoButton: {
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 18,
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
