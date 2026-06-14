import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Platform,
  useWindowDimensions,
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
          style={[
            styles.sectionAction,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.sectionActionText, { color: colors.tint }]}>
            {actionLabel}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.tint} />
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
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const cardWidth = isDesktop ? 198 : 142;

  if (isLoading) {
    return (
      <View style={styles.railContainer}>
        <SectionHeader eyebrow={eyebrow} title={title} />
        <SkeletonRow />
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View testID={testID} style={styles.railContainer}>
      <SectionHeader eyebrow={eyebrow} title={title} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item, index) => `${testID}-${item.id}-${index}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
        renderItem={({ item }) => (
          <View style={[styles.railCard, { width: cardWidth }]}>
            <CatalogItemCard item={item} />
          </View>
        )}
        ListFooterComponent={<View style={styles.railEndSpacer} />}
      />
      <View style={[styles.railDivider, { backgroundColor: colors.border }]} />
    </View>
  );
}

function HomeProviderRails() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data: addons } = useAddons();

  const catalogRows = useMemo(() => {
    const rows: {
      catalog: CatalogDefinition;
      addon: InstalledAddon;
    }[] = [];

    addons?.forEach((addon) => {
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
        onAction={() => router.push("/discover")}
      />
      {catalogRows.map(({ catalog, addon }) => (
        <CatalogRow
          key={`home-${addon.id}-${catalog.type}-${catalog.id}`}
          catalog={catalog}
          addon={addon}
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

  const movieCatalog = useInfiniteCatalog("movie");
  const seriesCatalog = useInfiniteCatalog("series");

  const movieItems = useMemo(
    () => flattenCatalogPages(movieCatalog.data),
    [movieCatalog.data],
  );
  const seriesItems = useMemo(
    () => flattenCatalogPages(seriesCatalog.data),
    [seriesCatalog.data],
  );

  const heroItem = movieItems[0] ?? seriesItems[0];
  const popularMovies = movieItems.slice(
    heroItem === movieItems[0] ? 1 : 0,
    13,
  );
  const topSeries = seriesItems.slice(heroItem === seriesItems[0] ? 1 : 0, 13);
  const recentlyAdded = [...movieItems.slice(1, 7), ...seriesItems.slice(1, 7)]
    .filter(
      (item, index, all) => all.findIndex((i) => i.id === item.id) === index,
    )
    .slice(0, 12);

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

      {heroItem ? <HomeHeroBanner item={heroItem} /> : <HomeSkeleton />}

      <ContinueWatchingRow showEmptyState />

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
        testID="home-popular-movies"
        eyebrow="TRENDING"
        title={t("home.sections.popularMovies")}
        items={popularMovies}
        isLoading={movieCatalog.isLoading}
      />

      <HomeRail
        testID="home-top-series"
        eyebrow="SERIES"
        title={t("home.sections.topTVShows")}
        items={topSeries}
        isLoading={seriesCatalog.isLoading}
      />

      <HomeRail
        testID="home-recently-added"
        eyebrow="NEW"
        title={t("home.sections.recentlyAdded")}
        items={recentlyAdded}
        isLoading={isLoading}
      />

      <HomeProviderRails />
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
    paddingHorizontal: 16,
    marginBottom: 14,
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
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
    letterSpacing: 0,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
  },
  sectionAction: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionActionText: {
    fontSize: 13,
    fontWeight: "800",
  },
  railContainer: {
    marginBottom: 26,
  },
  railContent: {
    paddingLeft: 16,
    gap: 12,
  },
  railCard: {
    marginRight: 12,
  },
  railEndSpacer: {
    width: 4,
  },
  railDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginTop: 8,
    opacity: 0.55,
  },
  providerRailSection: {
    marginTop: 2,
  },
});
