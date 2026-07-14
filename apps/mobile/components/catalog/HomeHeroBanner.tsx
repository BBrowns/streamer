import React, { memo } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { getWebFocusStyle, uiTouchTarget } from "../ui/designSystem";
import { useWindowClass } from "../../hooks/useWindowClass";

const isWeb = Platform.OS === "web";

function HomeHeroBannerInner({ item }: { item: MetaPreview }) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isCompact, isLarge, windowClass } = useWindowClass();
  const showPoster = windowClass === "expanded" || isLarge;
  const heroHeight = isCompact ? 430 : isLarge ? 520 : 480;
  const handleNavigate = () => router.push(`/detail/${item.type}/${item.id}`);

  return (
    <Pressable
      style={({ pressed, focused }: any) => [
        styles.hero,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          height: heroHeight,
          opacity: pressed ? 0.94 : 1,
        },
        isWeb && focused && getWebFocusStyle(colors.focus),
      ]}
      onPress={handleNavigate}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${item.name}`}
      accessibilityHint="Opens title details and playback options"
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.heroBackdrop}
        resizeMode="cover"
        blurRadius={18}
        accessibilityIgnoresInvertColors
      />

      {isWeb ? (
        <View
          style={[
            styles.heroOverlay,
            {
              background: isDark
                ? "linear-gradient(90deg, rgba(8,10,15,0.98) 0%, rgba(8,10,15,0.84) 52%, rgba(8,10,15,0.45) 100%)"
                : "linear-gradient(90deg, rgba(246,247,249,0.98) 0%, rgba(246,247,249,0.84) 52%, rgba(246,247,249,0.45) 100%)",
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.heroOverlay,
            {
              backgroundColor: isDark
                ? "rgba(8,10,15,0.80)"
                : "rgba(246,247,249,0.78)",
            },
          ]}
        />
      )}

      <View
        style={[styles.heroContent, showPoster && styles.heroContentDesktop]}
      >
        <View style={styles.heroCopy}>
          <View
            style={[
              styles.heroBadge,
              {
                backgroundColor: isDark
                  ? "rgba(216,180,254,0.18)"
                  : "rgba(167,139,250,0.16)",
                borderColor: isDark
                  ? "rgba(216,180,254,0.34)"
                  : "rgba(167,139,250,0.28)",
              },
            ]}
          >
            <Text
              style={[
                styles.heroBadgeText,
                { color: isDark ? "#f2d7ff" : "#7c5bd6" },
              ]}
            >
              {item.type === "movie" ? "MOVIE" : "SERIES"}
            </Text>
          </View>

          <Text
            style={[
              styles.heroTitle,
              {
                color: colors.text,
                fontSize: isLarge ? 48 : 34,
                lineHeight: isLarge ? 54 : 39,
              },
            ]}
            numberOfLines={3}
          >
            {item.name}
          </Text>

          <View style={styles.heroMetaRow}>
            {!!item.releaseInfo && (
              <Text
                style={[
                  styles.heroMetaPill,
                  {
                    color: colors.textSecondary,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.62)",
                  },
                ]}
              >
                {item.releaseInfo}
              </Text>
            )}
            {!!item.imdbRating && (
              <Text style={styles.heroRating}>{item.imdbRating} IMDb</Text>
            )}
          </View>

          {!!item.description && (
            <Text
              style={[styles.heroDesc, { color: colors.textSecondary }]}
              numberOfLines={showPoster ? 3 : 2}
            >
              {item.description}
            </Text>
          )}

          <View style={styles.heroActions}>
            <View
              style={[
                styles.heroPlayBtn,
                {
                  backgroundColor: colors.tint,
                },
              ]}
            >
              <Ionicons name="play" size={18} color={colors.onTint} />
              <Text style={[styles.heroPlayText, { color: colors.onTint }]}>
                Play
              </Text>
            </View>

            <View
              style={[
                styles.heroInfoBtn,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.09)"
                    : "rgba(255,255,255,0.58)",
                  borderColor: "rgba(127,111,145,0.2)",
                },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={colors.text}
              />
              <Text style={[styles.heroInfoText, { color: colors.text }]}>
                Details
              </Text>
            </View>
          </View>
        </View>

        {showPoster && (
          <View
            style={[
              styles.posterShell,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(255,255,255,0.62)",
                borderColor: colors.border,
              },
            ]}
          >
            <Image
              source={{ uri: item.poster }}
              style={styles.heroPoster}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const HomeHeroBanner = memo(HomeHeroBannerInner);

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 30,
    borderWidth: 1,
    position: "relative",
    marginBottom: 24,
    overflow: "hidden",
  },
  heroBackdrop: {
    ...StyleSheet.absoluteFillObject,
    width: "112%",
    height: "112%",
    left: -16,
    top: -16,
  },
  heroOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  } as any,
  heroContent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    justifyContent: "flex-end",
  },
  heroContentDesktop: {
    padding: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 42,
  },
  heroCopy: {
    flex: 1,
    maxWidth: 720,
  },
  heroBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
  },
  heroTitle: {
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 10,
  },
  heroMetaRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  heroMetaPill: {
    fontSize: 12,
    fontWeight: "800",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  heroRating: {
    color: "#d99a48",
    fontSize: 12,
    fontWeight: "900",
    backgroundColor: "rgba(255,217,168,0.2)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  heroDesc: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: 560,
  },
  heroActions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  heroPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 13,
    minHeight: uiTouchTarget,
    borderRadius: 999,
    // @ts-ignore web-only
    transition: "background-color 0.15s ease, transform 0.1s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  heroPlayText: {
    fontWeight: "800",
    fontSize: 15,
  },
  heroInfoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    minHeight: uiTouchTarget,
    borderRadius: 999,
    borderWidth: 1,
    // @ts-ignore web-only
    transition:
      "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  heroInfoText: {
    fontWeight: "700",
    fontSize: 15,
  },
  posterShell: {
    width: 230,
    aspectRatio: 2 / 3,
    borderRadius: 26,
    borderWidth: 1,
    padding: 8,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 24px 44px rgba(44, 34, 54, 0.24)" }
      : {}),
  } as any,
  heroPoster: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
  },
});
