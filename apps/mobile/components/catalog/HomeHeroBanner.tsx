import { memo } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import type { MetaPreview, WatchProgress } from "@streamer/shared";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useWindowClass } from "../../hooks/useWindowClass";
import { AppButton } from "../ui/AppButton";
import { uiRadii, uiSpacing, uiTypography } from "../ui/designSystem";

type HomeHeroBannerProps = {
  item: MetaPreview;
  progress?: WatchProgress | null;
  launching?: boolean;
  onPrimaryAction: () => void;
  onViewDetails: () => void;
};

function HomeHeroBannerInner({
  item,
  progress,
  launching = false,
  onPrimaryAction,
  onViewDetails,
}: HomeHeroBannerProps) {
  const { t } = useTranslation();
  const { isCompact, isLarge, windowClass } = useWindowClass();
  const showPoster = windowClass === "expanded" || isLarge;
  const heroHeight = isCompact ? 400 : isLarge ? 480 : 440;
  const shouldResume = (progress?.currentTime ?? 0) >= 15;

  return (
    <View
      testID="home-hero"
      style={[styles.hero, { height: heroHeight }]}
      accessibilityLabel={t("home.hero.a11y", { title: item.name })}
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.heroBackdrop}
        resizeMode="cover"
        blurRadius={10}
        accessibilityIgnoresInvertColors
      />

      {Platform.OS === "web" ? (
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

          <View style={styles.actionRow}>
            <AppButton
              testID="home-hero-primary-action"
              label={
                launching
                  ? t("detail.actionPanel.preparing", {
                      defaultValue: "Preparing…",
                    })
                  : shouldResume
                    ? t("common.actions.resume", { defaultValue: "Resume" })
                    : t("common.actions.play", { defaultValue: "Play" })
              }
              icon="play"
              variant="primary"
              size="large"
              loading={launching}
              disabled={launching}
              onPress={onPrimaryAction}
            />
            <AppButton
              label={t("common.actions.viewDetails")}
              icon="information-circle-outline"
              variant="secondary"
              size="large"
              disabled={launching}
              onPress={onViewDetails}
            />
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
    </View>
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
  heroOverlay: { ...StyleSheet.absoluteFillObject } as any,
  heroContent: {
    ...StyleSheet.absoluteFillObject,
    padding: uiSpacing.xxl,
    justifyContent: "flex-end",
  },
  heroContentDesktop: {
    padding: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 44,
  },
  heroCopy: { flex: 1, maxWidth: 680 },
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
  heroTitleLarge: { fontSize: 48, lineHeight: 52 },
  heroTitleCompact: { fontSize: 34, lineHeight: 39 },
  heroMetaRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.lg,
    marginBottom: uiSpacing.md,
  },
  heroMeta: { ...uiTypography.label, color: "#C5C9D0" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: uiSpacing.xs },
  heroDescription: {
    ...uiTypography.body,
    color: "#C5C9D0",
    maxWidth: 560,
    marginBottom: uiSpacing.xl,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  posterShell: {
    width: 198,
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
  heroPoster: { width: "100%", height: "100%" },
});
