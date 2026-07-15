import { memo, useCallback } from "react";
import { useRouter } from "expo-router";
import type { MetaPreview } from "@streamer/shared";
import { WatchProgressBar } from "../ui/WatchProgressBar";
import { hapticImpactLight } from "../../lib/haptics";
import { PosterCard } from "../ui/PosterCard";
import { useTranslation } from "react-i18next";

function CatalogCardInner({
  item,
  isFocused,
  onEnter,
}: {
  item: MetaPreview;
  isFocused?: boolean;
  onEnter?: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    hapticImpactLight();
    router.push(`/detail/${item.type}/${item.id}`);
  }, [item.id, item.type, router]);

  return (
    <PosterCard
      title={item.name}
      poster={item.poster}
      eyebrow={t(
        item.type === "movie" ? "common.media.movie" : "common.media.series",
      )}
      metadata={item.releaseInfo}
      rating={item.imdbRating}
      selected={isFocused}
      onPress={handlePress}
      onActivate={onEnter ?? handlePress}
      accessibilityHint={
        item.type === "movie"
          ? t("catalog.openMovieDetails")
          : t("catalog.openSeriesDetails")
      }
      mediaOverlay={<WatchProgressBar itemId={item.id} />}
    />
  );
}

export const CatalogItemCard = memo(CatalogCardInner);
