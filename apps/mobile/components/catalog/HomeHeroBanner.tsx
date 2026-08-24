import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MetaPreview, WatchProgress } from "@streamer/shared";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useWindowClass } from "../../hooks/useWindowClass";
import { AmbientHero } from "../ui/AmbientHero";
import { AppButton } from "../ui/AppButton";
import { uiSpacing, uiTypography } from "../ui/designSystem";
import { useCinematicTheme } from "../../contexts/CinematicThemeContext";

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
  const { isCompact, isLarge } = useWindowClass();
  const { theme: cinematicTheme } = useCinematicTheme();
  const shouldResume = (progress?.currentTime ?? 0) >= 15;

  return (
    <AmbientHero
      source={{
        contentKey: `${item.type}:${item.id}`,
        backgroundUri: item.background,
        posterUri: item.poster,
      }}
      title={t("home.hero.a11y", { title: item.name })}
      testID="home-hero"
    >
      <View style={[styles.copy, isCompact && styles.copyCompact]}>
        <Text style={styles.eyebrow}>
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
            styles.title,
            isCompact
              ? styles.titleCompact
              : isLarge
                ? styles.titleLarge
                : styles.titleMedium,
          ]}
          numberOfLines={3}
        >
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          {item.releaseInfo ? (
            <Text style={styles.meta}>{item.releaseInfo}</Text>
          ) : null}
          {item.imdbRating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={13} color="#E7B86A" />
              <Text style={styles.meta}>{item.imdbRating}</Text>
            </View>
          ) : null}
        </View>
        {item.description ? (
          <Text style={styles.description} numberOfLines={isCompact ? 2 : 3}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.actions}>
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
            tone="onArtwork"
            focusColor={cinematicTheme.focus}
            size="large"
            loading={launching}
            disabled={launching}
            onPress={onPrimaryAction}
          />
          <AppButton
            label={t("common.actions.viewDetails")}
            icon="information-circle-outline"
            variant="ghost"
            tone="onArtwork"
            focusColor={cinematicTheme.focus}
            size="large"
            disabled={launching}
            onPress={onViewDetails}
            style={styles.detailsButton}
          />
        </View>
      </View>
    </AmbientHero>
  );
}

export const HomeHeroBanner = memo(HomeHeroBannerInner);

const styles = StyleSheet.create({
  copy: { width: "100%", maxWidth: 610 },
  copyCompact: { maxWidth: 390 },
  eyebrow: {
    ...uiTypography.sectionLabel,
    color: "rgba(244,242,238,0.74)",
    marginBottom: uiSpacing.md,
    textTransform: "uppercase",
  },
  title: {
    ...uiTypography.cinematicDisplay,
    color: "#F4F2EE",
    textShadowColor: "rgba(0,0,0,0.34)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 16,
  },
  titleCompact: { fontSize: 42, lineHeight: 44, letterSpacing: -0.7 },
  titleMedium: { fontSize: 56, lineHeight: 58 },
  titleLarge: { fontSize: 68, lineHeight: 68, letterSpacing: -1.5 },
  metaRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.lg,
    marginTop: uiSpacing.lg,
  },
  meta: { ...uiTypography.label, color: "rgba(244,242,238,0.78)" },
  rating: { flexDirection: "row", alignItems: "center", gap: uiSpacing.xs },
  description: {
    ...uiTypography.body,
    color: "rgba(244,242,238,0.76)",
    maxWidth: 560,
    marginTop: uiSpacing.md,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: uiSpacing.sm,
    marginTop: uiSpacing.xl,
  },
  detailsButton: { backgroundColor: "rgba(8,9,11,0.22)" },
});
