import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Platform,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAddonCatalog } from "../../hooks/useAddonCatalog";
import type { CatalogDefinition, InstalledAddon } from "@streamer/shared";
import { hapticImpactLight } from "../../lib/haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { getWebFocusStyle, uiTouchTarget } from "../ui/designSystem";

function HeroBannerInner({
  catalog,
  addon,
}: {
  catalog?: CatalogDefinition;
  addon?: InstalledAddon;
}) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const heroHeight = isDesktop
    ? Math.min(500, Math.max(400, height * 0.56))
    : Math.min(500, Math.max(360, height * 0.52));
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
    <View style={[styles.container, { height: heroHeight }]}>
      <Pressable
        onPress={handlePress}
        style={({ pressed, focused }: any) => [
          styles.pressable,
          pressed && { opacity: 0.94 },
          Platform.OS === "web" && focused && getWebFocusStyle(colors.tint),
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Featured: ${featuredItem.name}`}
        accessibilityHint="Opens title details and playback options"
      >
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
                    pointerEvents: "none",
                  },
                ]}
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
    width: "100%",
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
    minHeight: uiTouchTarget,
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
    minHeight: uiTouchTarget,
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
