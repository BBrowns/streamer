import { memo, useCallback } from "react";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import { WatchProgressBar } from "../ui/WatchProgressBar";
import { hapticImpactLight } from "../../lib/haptics";
import { MediaCard } from "../ui/MediaCard";
import { useTranslation } from "react-i18next";
import { useCinematicTheme } from "../../contexts/CinematicThemeContext";
import type { CinematicTheme } from "../../services/cinematicTheme";

export function getCatalogCardPalette(
  cinematic: boolean,
  theme: Pick<CinematicTheme, "focus" | "accent" | "accentSoft" | "progress">,
) {
  if (!cinematic) return {};
  return {
    focusColor: theme.focus,
    accentColor: theme.accent,
    selectedColor: theme.accentSoft,
    progressColor: theme.progress,
  };
}

function CatalogCardInner({
  item,
  isFocused,
  onEnter,
  cinematic = false,
}: {
  item: MetaPreview;
  isFocused?: boolean;
  onEnter?: () => void;
  cinematic?: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme: cinematicTheme } = useCinematicTheme();
  const cinematicPalette = getCatalogCardPalette(cinematic, cinematicTheme);
  const handlePress = useCallback(() => {
    hapticImpactLight();
    router.push(`/detail/${item.type}/${item.id}`);
  }, [item.id, item.type, router]);

  return (
    <MediaCard
      title={item.name}
      poster={item.poster}
      eyebrow={t(
        item.type === "movie" ? "common.media.movie" : "common.media.series",
      )}
      metadata={item.releaseInfo}
      rating={item.imdbRating}
      selected={isFocused}
      {...cinematicPalette}
      onPress={handlePress}
      onActivate={onEnter ?? handlePress}
      accessibilityHint={
        item.type === "movie"
          ? t("catalog.openMovieDetails")
          : t("catalog.openSeriesDetails")
      }
      mediaOverlay={
        <WatchProgressBar
          itemId={item.id}
          progressColor={cinematicPalette.progressColor}
        />
      }
    />
  );
}

export const CatalogItemCard = memo(CatalogCardInner);
