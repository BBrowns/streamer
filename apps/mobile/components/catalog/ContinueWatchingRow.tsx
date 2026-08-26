import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { WatchProgress } from "@streamer/shared";
import {
  useContinueWatching,
  useRemoveProgress,
  useUpdateProgress,
} from "../../hooks/useContinueWatching";
import { useToastStore } from "../../stores/toastStore";
import { useTheme } from "../../hooks/useTheme";
import { Surface } from "../ui/Surface";
import { SkeletonRow } from "../ui/SkeletonLoader";
import { getWindowGutter, uiSpacing, uiTypography } from "../ui/designSystem";
import { useWindowClass } from "../../hooks/useWindowClass";
import { MediaRail } from "../ui/MediaRail";
import { ContinueWatchingCard as ContinueWatchingMediaCard } from "../ui/ContinueWatchingCard";
import { playBest } from "../../services/playback/PlaybackOrchestrator";
import { usePlayerStore } from "../../stores/playerStore";
import { extractErrorMessage } from "../../utils/error";

type ContinueWatchingRowProps = {
  showEmptyState?: boolean;
  excludeContentKey?: string | null;
};

function hasTrustedDuration(item: WatchProgress) {
  return (
    item.duration > 0 &&
    (item.durationSource === "metadata" || item.durationSource === "media")
  );
}

function episodeLabel(item: WatchProgress) {
  if (!item.season || !item.episode) return null;
  return `S${item.season} E${item.episode}`;
}

function playbackCoordinate(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

export function getContinueWatchingCardWidth(
  windowClass: "compact" | "medium" | "expanded" | "large",
) {
  if (windowClass === "compact") return 270;
  if (windowClass === "medium") return 300;
  if (windowClass === "expanded") return 344;
  return 400;
}

function ContinueWatchingCard({
  item,
  onRemove,
  isRemoving,
}: {
  item: WatchProgress;
  onRemove: (itemId: string) => void;
  isRemoving: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const setSessionStream = usePlayerStore((state) => state.setSessionStream);
  const [isResuming, setIsResuming] = useState(false);
  const durationIsTrusted = hasTrustedDuration(item);
  const remainingMinutes = durationIsTrusted
    ? Math.max(1, Math.ceil(Math.max(0, item.duration - item.currentTime) / 60))
    : null;
  const watchedMinutes = Math.max(1, Math.floor(item.currentTime / 60));
  const progress = durationIsTrusted
    ? Math.min(Math.round((item.currentTime / item.duration) * 100), 100)
    : undefined;

  const handleResume = useCallback(async () => {
    if (isResuming) return;
    setIsResuming(true);
    try {
      const result = await playBest({
        type: item.type,
        id: item.itemId,
        title: item.title,
        poster: item.poster ?? undefined,
        ...(item.background ? { background: item.background } : {}),
        season: playbackCoordinate(item.season),
        episode: playbackCoordinate(item.episode),
      });
      if (!result.ok) {
        useToastStore.getState().show(result.error.message, "error");
        return;
      }
      setSessionStream(
        result.stream,
        result.mediaInfo,
        result.sessionId,
        result.candidateId,
        null,
        null,
        { type: "resume", positionSeconds: item.currentTime },
      );
      router.push("/player");
    } catch (error: unknown) {
      useToastStore.getState().show(
        extractErrorMessage(error) ||
          t("detail.errors.notPlayable", {
            defaultValue: "Playback is unavailable right now.",
          }),
        "error",
      );
    } finally {
      setIsResuming(false);
    }
  }, [isResuming, item, router, setSessionStream, t]);

  return (
    <ContinueWatchingMediaCard
      title={item.title}
      background={item.background}
      poster={item.poster}
      kicker={episodeLabel(item) ?? t(`home.continueWatching.${item.type}`)}
      metadata={
        durationIsTrusted
          ? t("home.continueWatching.remaining", {
              minutes: remainingMinutes,
              progress,
            })
          : t("home.continueWatching.watched", {
              minutes: watchedMinutes,
              defaultValue: "{{minutes}}m watched",
            })
      }
      progress={progress}
      resumeLabel={t("common.actions.resume", { defaultValue: "Resume" })}
      resumeAccessibilityLabel={
        durationIsTrusted
          ? t("home.continueWatching.resumeA11y", {
              title: item.title,
              minutes: remainingMinutes,
            })
          : t("home.continueWatching.resumeWatchedA11y", {
              title: item.title,
              minutes: watchedMinutes,
              defaultValue: "Resume {{title}}, {{minutes}} minutes watched",
            })
      }
      detailsLabel={t("library.actions.viewDetails", {
        defaultValue: "View Details",
      })}
      detailsAccessibilityLabel={`${t("library.actions.viewDetails", {
        defaultValue: "View Details",
      })}: ${item.title}`}
      moreActionsAccessibilityLabel={t("home.continueWatching.moreActions", {
        title: item.title,
        defaultValue: "More actions for {{title}}",
      })}
      removeLabel={t("home.continueWatching.removeA11y", {
        title: item.title,
      })}
      resuming={isResuming}
      removing={isRemoving}
      onOpen={() => router.push(`/detail/${item.type}/${item.itemId}`)}
      onResume={() => void handleResume()}
      onRemove={() => onRemove(item.itemId)}
    />
  );
}

const MemoizedCard = memo(ContinueWatchingCard);

export function ContinueWatchingRow({
  showEmptyState = false,
  excludeContentKey,
}: ContinueWatchingRowProps) {
  const { data: items, isLoading } = useContinueWatching();
  const removeProgress = useRemoveProgress();
  const updateProgress = useUpdateProgress();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { windowClass } = useWindowClass();
  const cardWidth = getContinueWatchingCardWidth(windowClass);
  const contentPadding = getWindowGutter(windowClass);
  const visibleItems = useMemo(
    () =>
      (items ?? []).filter(
        (item) => `${item.type}:${item.itemId}` !== excludeContentKey,
      ),
    [excludeContentKey, items],
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View
          style={[styles.loadingHeader, { paddingHorizontal: contentPadding }]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("home.continueWatching.title")}
          </Text>
        </View>
        <SkeletonRow />
      </View>
    );
  }

  if (visibleItems.length === 0) {
    if (!showEmptyState) return null;
    return (
      <View style={styles.container}>
        <Surface
          variant="plain"
          style={[styles.emptySurface, { marginHorizontal: contentPadding }]}
        >
          <Ionicons
            name="time-outline"
            size={22}
            color={colors.textSecondary}
          />
          <View style={styles.emptyCopy}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t("home.continueWatching.emptyTitle")}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t("home.continueWatching.emptyDescription")}
            </Text>
          </View>
        </Surface>
      </View>
    );
  }

  return (
    <MediaRail
      style={styles.container}
      testID="continue-watching-row"
      title={t("home.continueWatching.title")}
      data={visibleItems}
      cardWidth={cardWidth}
      contentPadding={contentPadding}
      keyExtractor={(item) =>
        `cw-${item.itemId}-${item.season ?? 0}-${item.episode ?? 0}`
      }
      renderItem={(item) => (
        <MemoizedCard
          item={item}
          onRemove={(itemId) => {
            const removedItem = visibleItems.find(
              (entry) => entry.itemId === itemId,
            );
            removeProgress.mutate(itemId, {
              onSuccess: () => {
                if (!removedItem) return;
                useToastStore
                  .getState()
                  .show("Removed from Continue Watching", "info", {
                    actionLabel: "Undo",
                    onAction: () =>
                      updateProgress.mutateAsync({
                        type: removedItem.type,
                        itemId: removedItem.itemId,
                        season: removedItem.season ?? undefined,
                        episode: removedItem.episode ?? undefined,
                        currentTime: removedItem.currentTime,
                        duration: removedItem.duration,
                        durationSource: removedItem.durationSource,
                        title: removedItem.title,
                        poster: removedItem.poster ?? undefined,
                        background: removedItem.background ?? undefined,
                      }),
                  });
              },
            });
          }}
          isRemoving={removeProgress.isPending}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: uiSpacing.xxxl },
  loadingHeader: { marginBottom: uiSpacing.md },
  sectionTitle: { ...uiTypography.title, fontSize: 20, lineHeight: 26 },
  emptySurface: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  emptyCopy: { flex: 1, gap: 2 },
  emptyTitle: { ...uiTypography.control },
  emptyText: { ...uiTypography.caption },
});
