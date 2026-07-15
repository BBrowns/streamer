import {
  View,
  Text,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteCatalog } from "../../hooks/useInfiniteCatalog";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CatalogDefinition,
  InstalledAddon,
  MetaPreview,
} from "@streamer/shared";
import {
  SkeletonLoader,
  SkeletonRow,
} from "../../components/ui/SkeletonLoader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useAddons } from "../../hooks/useAddons";
import { HomeHeroBanner } from "../../components/catalog/HomeHeroBanner";
import { CatalogItemCard } from "../../components/catalog/CatalogItemCard";
import { CatalogRow } from "../../components/catalog/CatalogRow";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useContinueWatching } from "../../hooks/useContinueWatching";
import { useWindowClass } from "../../hooks/useWindowClass";
import { buildHomeFeed } from "../../services/homeFeed";
import { playBest } from "../../services/playback/PlaybackOrchestrator";
import { usePlayerStore } from "../../stores/playerStore";
import { useToastStore } from "../../stores/toastStore";
import { MediaRail } from "../../components/ui/MediaRail";
import {
  getWebFocusStyle,
  uiLayout,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../../components/ui/designSystem";

function flattenCatalogPages(data: any): MetaPreview[] {
  return (
    data?.pages.flatMap(
      (page: { metas?: MetaPreview[] }) => page.metas ?? [],
    ) ?? []
  );
}

function SectionHeader({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        {!!eyebrow && (
          <Text style={[styles.sectionEyebrow, { color: colors.tint }]}>
            {eyebrow}
          </Text>
        )}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {title}
        </Text>
      </View>
      {!!actionLabel && !!onAction && (
        <Pressable
          style={({ pressed, focused }: any) => [
            styles.sectionAction,
            { backgroundColor: "transparent" },
            pressed && { opacity: 0.78 },
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text
            style={[styles.sectionActionText, { color: colors.textSecondary }]}
          >
            {actionLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={15}
            color={colors.textSecondary}
          />
        </Pressable>
      )}
    </View>
  );
}

function HomeRail({
  title,
  eyebrow,
  items,
  isLoading,
  testID,
}: {
  title: string;
  eyebrow: string;
  items: MetaPreview[];
  isLoading: boolean;
  testID: string;
}) {
  const { colors } = useTheme();
  const { isLarge } = useWindowClass();
  const cardWidth = isLarge ? 198 : 142;

  if (isLoading) {
    return (
      <MediaRail
        style={styles.railContainer}
        title={title}
        eyebrow={eyebrow}
        data={[] as MetaPreview[]}
        cardWidth={cardWidth}
        keyExtractor={(item) => `${item.type}:${item.id}`}
        renderItem={(item) => <CatalogItemCard item={item} />}
        loading
        loadingContent={<SkeletonRow />}
      />
    );
  }

  if (items.length === 0) return null;

  return (
    <View testID={testID} style={styles.railContainer}>
      <MediaRail
        title={title}
        eyebrow={eyebrow}
        data={items}
        cardWidth={cardWidth}
        keyExtractor={(item) => `${testID}-${item.type}:${item.id}`}
        renderItem={(item) => <CatalogItemCard item={item} />}
      />
      <View style={[styles.railDivider, { backgroundColor: colors.border }]} />
    </View>
  );
}

function HomeProviderRails({
  excludeContentKeys,
}: {
  excludeContentKeys: ReadonlySet<string>;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { data: addons } = useAddons();

  const catalogRows = useMemo(() => {
    const rows: {
      catalog: CatalogDefinition;
      addon: InstalledAddon;
    }[] = [];

    [...(addons ?? [])]
      .sort((left, right) => left.installedAt.localeCompare(right.installedAt))
      .forEach((addon) => {
        addon.manifest.catalogs.forEach((catalog) => {
          if (catalog.type === "movie" || catalog.type === "series") {
            rows.push({ catalog, addon });
          }
        });
      });

    return rows.slice(0, 6);
  }, [addons]);

  if (catalogRows.length === 0) return null;

  return (
    <View style={styles.providerRailSection}>
      <SectionHeader
        eyebrow="PROVIDERS"
        title={t("home.sections.fromProviders")}
        actionLabel={t("tabs.discover")}
        onAction={() => router.push("/search?mode=discover")}
      />
      {catalogRows.map(({ catalog, addon }) => (
        <CatalogRow
          key={`home-${addon.id}-${catalog.type}-${catalog.id}`}
          catalog={catalog}
          addon={addon}
          excludeContentKeys={excludeContentKeys}
        />
      ))}
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View style={styles.loadingWrap}>
      <SkeletonLoader
        variant="card"
        height={420}
        borderRadius={28}
        style={styles.heroSkeleton}
      />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
}

// ─── Home Content ─────────────────────────────────────────────────────────────
function HomeContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [heroLaunching, setHeroLaunching] = useState(false);
  const setSessionStream = usePlayerStore((state) => state.setSessionStream);

  const movieCatalog = useInfiniteCatalog("movie");
  const seriesCatalog = useInfiniteCatalog("series");
  const { data: continueWatchingItems = [] } = useContinueWatching();

  const movieItems = useMemo(
    () => flattenCatalogPages(movieCatalog.data),
    [movieCatalog.data],
  );
  const seriesItems = useMemo(
    () => flattenCatalogPages(seriesCatalog.data),
    [seriesCatalog.data],
  );

  const homeFeed = useMemo(
    () => buildHomeFeed(movieItems, seriesItems, continueWatchingItems),
    [continueWatchingItems, movieItems, seriesItems],
  );
  const heroItem = homeFeed.hero;
  const heroProgress = homeFeed.heroProgress;
  const movies =
    homeFeed.rails.find((rail) => rail.key === "movies")?.items ?? [];
  const series =
    homeFeed.rails.find((rail) => rail.key === "series")?.items ?? [];
  const moreToWatch =
    homeFeed.rails.find((rail) => rail.key === "more_to_watch")?.items ?? [];
  const claimedContentKeys = useMemo(() => {
    const claimed = new Set<string>();
    if (heroItem) claimed.add(`${heroItem.type}:${heroItem.id}`);
    continueWatchingItems.forEach((item) =>
      claimed.add(`${item.type}:${item.itemId}`),
    );
    homeFeed.rails.forEach((rail) =>
      rail.items.forEach((item) => claimed.add(`${item.type}:${item.id}`)),
    );
    return claimed;
  }, [continueWatchingItems, heroItem, homeFeed.rails]);

  const isLoading =
    !isHydrated || movieCatalog.isLoading || seriesCatalog.isLoading;
  const hasAnyItems = movieItems.length > 0 || seriesItems.length > 0;
  const hasLoadError =
    !hasAnyItems && (movieCatalog.isError || seriesCatalog.isError);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["addons"] }),
      queryClient.invalidateQueries({ queryKey: ["progress"] }),
      queryClient.invalidateQueries({ queryKey: ["library"] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const handleHeroPlayback = useCallback(async () => {
    if (!heroItem || heroLaunching) return;
    setHeroLaunching(true);
    try {
      const result = await playBest({
        type: heroItem.type,
        id: heroItem.id,
        title: heroItem.name,
        poster: heroItem.poster,
        season: heroProgress?.season ?? undefined,
        episode: heroProgress?.episode ?? undefined,
      });
      if (!result.ok) {
        useToastStore.getState().show(result.error.message, "error");
        return;
      }

      const shouldResume = (heroProgress?.currentTime ?? 0) >= 15;
      setSessionStream(
        result.stream,
        result.mediaInfo,
        result.sessionId,
        result.candidateId,
        null,
        null,
        shouldResume
          ? {
              type: "resume",
              positionSeconds: heroProgress!.currentTime,
            }
          : { type: "play" },
      );
      router.push("/player");
    } catch (error: any) {
      useToastStore.getState().show(
        error?.message ||
          t("detail.errors.notPlayable", {
            defaultValue: "Playback is unavailable right now.",
          }),
        "error",
      );
    } finally {
      setHeroLaunching(false);
    }
  }, [heroItem, heroLaunching, heroProgress, router, setSessionStream, t]);

  if (!isHydrated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <HomeSkeleton />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          size="large"
          icon="film-outline"
          title={t("home.auth.title")}
          description={t("home.auth.subtitle")}
          actionLabel={t("home.auth.button")}
          onAction={() => router.push("/login")}
        />
      </View>
    );
  }

  return (
    <ScrollView
      testID="home-screen"
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.tint}
          colors={[colors.tint]}
        />
      }
    >
      <OfflineBanner />

      {heroItem ? (
        <HomeHeroBanner
          item={heroItem}
          progress={heroProgress}
          launching={heroLaunching}
          onPrimaryAction={() => void handleHeroPlayback()}
          onViewDetails={() =>
            router.push(`/detail/${heroItem.type}/${heroItem.id}`)
          }
        />
      ) : (
        <HomeSkeleton />
      )}

      <ContinueWatchingRow
        excludeContentKey={
          heroItem ? `${heroItem.type}:${heroItem.id}` : undefined
        }
      />

      {hasLoadError && (
        <View style={styles.stateWrap}>
          <EmptyState
            icon="cloud-offline-outline"
            title={t("home.empty.retryTitle")}
            description={t("home.empty.retryDescription")}
            actionLabel={t("home.empty.retryAction")}
            onAction={handleRefresh}
          />
        </View>
      )}

      {!hasLoadError && !isLoading && !hasAnyItems && (
        <View style={styles.stateWrap}>
          <EmptyState
            icon="cube-outline"
            title={t("home.empty.title")}
            description={t("home.empty.description")}
            actionLabel={t("home.empty.action")}
            onAction={() => router.push("/addons")}
          />
        </View>
      )}

      <HomeRail
        testID="home-movies"
        eyebrow={t("home.sections.catalogEyebrow")}
        title={t("home.sections.movies")}
        items={movies}
        isLoading={movieCatalog.isLoading}
      />

      <HomeRail
        testID="home-series"
        eyebrow={t("home.sections.catalogEyebrow")}
        title={t("home.sections.series")}
        items={series}
        isLoading={seriesCatalog.isLoading}
      />

      <HomeRail
        testID="home-more-to-watch"
        eyebrow={t("home.sections.exploreEyebrow")}
        title={t("home.sections.moreToWatch")}
        items={moreToWatch}
        isLoading={isLoading}
      />

      <HomeProviderRails excludeContentKeys={claimedContentKeys} />
    </ScrollView>
  );
}

export default function HomeScreen() {
  return (
    <ErrorBoundary>
      <HomeContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    width: "100%",
    maxWidth: uiLayout.contentMaxWidth,
    alignSelf: "center",
    paddingBottom: 44,
  },
  loadingWrap: {
    paddingTop: 12,
  },
  heroSkeleton: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  stateWrap: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionHeader: {
    paddingHorizontal: uiSpacing.lg,
    marginBottom: uiSpacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionEyebrow: {
    ...uiTypography.sectionLabel,
    fontSize: 10,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sectionTitle: {
    ...uiTypography.title,
  },
  sectionAction: {
    minHeight: uiTouchTarget,
    borderRadius: uiRadii.control,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionActionText: {
    ...uiTypography.label,
  },
  railContainer: {
    marginBottom: uiSpacing.xxxl,
  },
  railDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginTop: 8,
    opacity: 0.35,
  },
  providerRailSection: {
    marginTop: 2,
  },
});
