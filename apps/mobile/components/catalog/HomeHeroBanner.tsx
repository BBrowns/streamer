import { memo } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";
import { useTranslation } from "react-i18next";

const isWeb = Platform.OS === "web";

function HomeHeroBannerInner({ item }: { item: MetaPreview }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isCompact, isLarge, windowClass } = useWindowClass();
  const showPoster = windowClass === "expanded" || isLarge;
  const heroHeight = isCompact ? 440 : isLarge ? 540 : 490;
  const handleNavigate = () => router.push(`/detail/${item.type}/${item.id}`);

  return (
    <Pressable
      style={({ pressed, focused }: any) => [
        styles.hero,
        {
          backgroundColor: colors.surfaceElevated,
          height: heroHeight,
          opacity: pressed ? 0.9 : 1,
        },
        isWeb && focused && getWebFocusStyle(colors.focus),
      ]}
      onPress={handleNavigate}
      accessibilityRole="button"
      accessibilityLabel={t("home.hero.a11y", { title: item.name })}
      accessibilityHint={t("home.hero.hint")}
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.heroBackdrop}
        resizeMode="cover"
        blurRadius={10}
        accessibilityIgnoresInvertColors
      />

      {isWeb ? (
        <View
          style={[
            styles.heroOverlay,
            {
              background:
                "linear-gradient(90deg, rgba(8,9,12,0.98) 0%, rgba(8,9,12,0.87) 48%, rgba(8,9,12,0.35) 100%)",
            },
          ]}
        />
      ) : (
        <View
          style={[styles.heroOverlay, { backgroundColor: "rgba(8,9,12,0.76)" }]}
        />
      )}

      <View
        style={[styles.heroContent, showPoster && styles.heroContentDesktop]}
      >
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>
            {t("home.hero.eyebrow", {
              type: t(
                item.type === "movie"
                  ? "common.media.movie"
                  : "common.media.series",
              ),
            })}
          </Text>

          <Text
            style={[
              styles.heroTitle,
              isLarge ? styles.heroTitleLarge : styles.heroTitleCompact,
            ]}
            numberOfLines={3}
          >
            {item.name}
          </Text>

          <View style={styles.heroMetaRow}>
            {item.releaseInfo ? (
              <Text style={styles.heroMeta}>{item.releaseInfo}</Text>
            ) : null}
            {item.imdbRating ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={13} color="#E7B86A" />
                <Text style={styles.heroMeta}>{item.imdbRating}</Text>
              </View>
            ) : null}
          </View>

          {item.description ? (
            <Text
              style={styles.heroDescription}
              numberOfLines={showPoster ? 3 : 2}
            >
              {item.description}
            </Text>
          ) : null}

          <View style={styles.detailsButton}>
            <Text style={styles.detailsButtonText}>
              {t("common.actions.viewDetails")}
            </Text>
            <Ionicons name="arrow-forward" size={17} color="#08090C" />
          </View>
        </View>

        {showPoster ? (
          <View style={styles.posterShell}>
            <Image
              source={{ uri: item.poster }}
              style={styles.heroPoster}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const HomeHeroBanner = memo(HomeHeroBannerInner);

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.md,
    marginBottom: uiSpacing.xxxl,
    borderRadius: uiRadii.hero,
    position: "relative",
    overflow: "hidden",
  },
  heroBackdrop: {
    ...StyleSheet.absoluteFillObject,
    width: "108%",
    height: "108%",
    left: -12,
    top: -12,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  } as any,
  heroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: uiSpacing.xxl,
    justifyContent: "flex-end",
  },
  heroContentDesktop: {
    padding: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 48,
  },
  heroCopy: {
    flex: 1,
    maxWidth: 680,
  },
  heroEyebrow: {
    ...uiTypography.sectionLabel,
    color: "#B7BEFF",
    marginBottom: uiSpacing.md,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontFamily: uiTypography.display.fontFamily,
    color: "#F4F5F7",
    fontWeight: "800",
    letterSpacing: -1,
    marginBottom: uiSpacing.md,
  },
  heroTitleLarge: {
    fontSize: 52,
    lineHeight: 56,
  },
  heroTitleCompact: {
    fontSize: 36,
    lineHeight: 40,
  },
  heroMetaRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.lg,
    marginBottom: uiSpacing.md,
  },
  heroMeta: {
    ...uiTypography.label,
    color: "#C5C9D0",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.xs,
  },
  heroDescription: {
    ...uiTypography.body,
    color: "#C5C9D0",
    maxWidth: 560,
    marginBottom: uiSpacing.xl,
  },
  detailsButton: {
    minHeight: uiTouchTarget,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
    borderRadius: uiRadii.control,
    backgroundColor: "#F4F5F7",
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.md,
  },
  detailsButtonText: {
    ...uiTypography.control,
    color: "#08090C",
  },
  posterShell: {
    width: 224,
    aspectRatio: 2 / 3,
    borderRadius: uiRadii.card,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 24px 56px rgba(0,0,0,0.42)" }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.38,
          shadowRadius: 28,
        }),
  } as any,
  heroPoster: {
    width: "100%",
    height: "100%",
  },
});
