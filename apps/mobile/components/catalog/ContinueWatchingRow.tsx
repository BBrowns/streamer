import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
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
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import { Surface } from "../ui/Surface";
import { AppButton } from "../ui/AppButton";
import { SkeletonRow } from "../ui/SkeletonLoader";
import {
  getSoftOverlayColor,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "../ui/designSystem";

type ContinueWatchingRowProps = {
  showEmptyState?: boolean;
};

function formatRemainingMinutes(item: WatchProgress) {
  const remainingSeconds = Math.max(0, item.duration - item.currentTime);
  return Math.max(1, Math.ceil(remainingSeconds / 60));
}

function episodeLabel(item: WatchProgress) {
  if (item.season == null || item.episode == null) return null;
  return `S${item.season} E${item.episode}`;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.progressTrack,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.14)"
            : "rgba(30,25,45,0.12)",
        },
      ]}
    >
      <View
        style={[
          styles.progressFill,
          { width: `${pct}%`, backgroundColor: colors.tint },
        ]}
      />
    </View>
  );
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
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const cardWidth = isDesktop ? 360 : 286;
  const posterWidth = isDesktop ? 142 : 112;
  const posterUri = typeof item.poster === "string" ? item.poster.trim() : "";
  const remainingMinutes = formatRemainingMinutes(item);
  const progressPercent =
    item.duration > 0
      ? Math.min(Math.round((item.currentTime / item.duration) * 100), 100)
      : 0;
  const episode = episodeLabel(item);

  const handleResume = () => {
    router.push(`/detail/${item.type}/${item.itemId}`);
  };
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(handleResume);

  return (
    <Surface
      padded={false}
      style={[
        styles.card,
        { width: cardWidth },
        Platform.OS === "web" && isKeyboardFocused && styles.cardFocused,
      ]}
    >
      <Pressable
        {...webPressableProps}
        onPress={handleResume}
        accessibilityRole="button"
        accessibilityLabel={t("home.continueWatching.resumeA11y", {
          title: item.title,
          minutes: remainingMinutes,
          defaultValue: `Resume ${item.title}, ${remainingMinutes} minutes remaining`,
        })}
        style={({ pressed, hovered }: any) => [
          styles.resumeArea,
          pressed && styles.pressed,
          Platform.OS === "web" &&
            hovered && {
              backgroundColor: getSoftOverlayColor(isDark),
            },
        ]}
      >
        <View
          style={[
            styles.posterFrame,
            {
              width: posterWidth,
              backgroundColor: isDark
                ? "rgba(216,180,254,0.12)"
                : "rgba(167,139,250,0.12)",
            },
          ]}
        >
          {posterUri ? (
            <Image
              source={{ uri: posterUri }}
              style={styles.poster}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel={`${item.title} poster`}
            />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons
                name={item.type === "movie" ? "film-outline" : "tv-outline"}
                size={24}
                color={colors.tint}
              />
            </View>
          )}
          <ProgressBar current={item.currentTime} total={item.duration} />
        </View>

        <View style={styles.copy}>
          <View>
            <Text style={[styles.kicker, { color: colors.tint }]}>
              {episode ?? t(`home.continueWatching.${item.type}`)}
            </Text>
            <Text
              style={[styles.title, { color: colors.text }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
          </View>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {t("home.continueWatching.remaining", {
              minutes: remainingMinutes,
              progress: progressPercent,
            })}
          </Text>
        </View>
      </Pressable>
      <View style={styles.actionRow}>
        <AppButton
          label={t("home.continueWatching.resume")}
          icon="play"
          size="small"
          variant="primary"
          onPress={handleResume}
        />
        <Pressable
          onPress={() => onRemove(item.itemId)}
          disabled={isRemoving}
          accessibilityRole="button"
          accessibilityLabel={t("home.continueWatching.removeA11y", {
            title: item.title,
            defaultValue: `Remove ${item.title} from Continue Watching`,
          })}
          style={({ pressed, hovered }: any) => [
            styles.iconButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: isRemoving ? 0.5 : pressed ? 0.72 : 1,
            },
            Platform.OS === "web" && hovered && { borderColor: colors.tint },
          ]}
        >
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
    </Surface>
  );
}

const MemoizedCard = memo(ContinueWatchingCard);

export function ContinueWatchingRow({
  showEmptyState = false,
}: ContinueWatchingRowProps) {
  const { data: items, isLoading } = useContinueWatching();
  const removeProgress = useRemoveProgress();
  const updateProgress = useUpdateProgress();
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("home.continueWatching.title")}
          </Text>
        </View>
        <SkeletonRow />
      </View>
    );
  }

  if (!items || items.length === 0) {
    if (!showEmptyState) return null;
    return (
      <View style={styles.container}>
        <Surface variant="accent" style={styles.emptySurface}>
          <Ionicons name="play-circle-outline" size={22} color={colors.tint} />
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
    <View style={styles.container} testID="continue-watching-row">
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <Ionicons name="play-circle-outline" size={22} color={colors.tint} />
          <View>
            <Text style={[styles.sectionEyebrow, { color: colors.tint }]}>
              {t("home.continueWatching.eyebrow")}
            </Text>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t("home.continueWatching.title")}
            </Text>
          </View>
        </View>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) =>
          `cw-${item.itemId}-${item.season ?? 0}-${item.episode ?? 0}`
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <MemoizedCard
            item={item}
            onRemove={(itemId) => {
              const removedItem = items.find(
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
                          title: removedItem.title,
                          poster: removedItem.poster ?? undefined,
                        }),
                    });
                },
              });
            }}
            isRemoving={removeProgress.isPending}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: uiSpacing.xxl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiSpacing.lg,
    marginBottom: uiSpacing.md,
  },
  titleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  sectionEyebrow: {
    ...uiTypography.sectionLabel,
    fontSize: 10,
    textTransform: "uppercase",
  },
  sectionTitle: {
    ...uiTypography.title,
  },
  listContent: {
    paddingHorizontal: uiSpacing.lg,
    gap: uiSpacing.md,
  },
  card: {
    overflow: "hidden",
  },
  cardFocused: {
    // @ts-ignore web-only
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineColor: "#a78bfa",
    outlineOffset: 3,
  } as any,
  resumeArea: {
    minHeight: 154,
    flexDirection: "row",
  },
  pressed: {
    opacity: 0.88,
  },
  posterFrame: {
    aspectRatio: 2 / 3,
    overflow: "hidden",
  },
  poster: {
    width: "100%",
    height: "100%",
  },
  posterFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
  },
  progressFill: {
    height: 4,
    borderTopRightRadius: uiRadii.xs,
    borderBottomRightRadius: uiRadii.xs,
  },
  copy: {
    flex: 1,
    padding: uiSpacing.md,
    justifyContent: "center",
    gap: uiSpacing.sm,
  },
  kicker: {
    ...uiTypography.sectionLabel,
    fontSize: 10,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 2,
  },
  meta: {
    ...uiTypography.caption,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.sm,
    paddingHorizontal: uiSpacing.md,
    paddingBottom: uiSpacing.md,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: uiRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySurface: {
    marginHorizontal: uiSpacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  emptyCopy: {
    flex: 1,
    gap: 2,
  },
  emptyTitle: {
    ...uiTypography.control,
  },
  emptyText: {
    ...uiTypography.caption,
  },
});
