import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useInfiniteCatalog } from "../../hooks/useInfiniteCatalog";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import type {
  CatalogDefinition,
  InstalledAddon,
  MetaPreview,
} from "@streamer/shared";
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { FilterChipBar } from "../../components/ui/FilterChipBar";
import { SkeletonCardGrid } from "../../components/ui/SkeletonLoader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { Ionicons } from "@expo/vector-icons";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useTheme } from "../../hooks/useTheme";
import { useAddons } from "../../hooks/useAddons";
import { streamEngineManager } from "../../services/streamEngine/StreamEngineManager";
import { getBridgeStatusPresentation } from "../../services/streamEngine/bridgeStatusPresentation";

import { HomeHeroBanner } from "../../components/catalog/HomeHeroBanner";
import { CatalogItemCard } from "../../components/catalog/CatalogItemCard";
import { CatalogRow } from "../../components/catalog/CatalogRow";

function SourceBridgeStatusCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const streamServerUrl = useAuthStore((s) => s.streamServerUrl);
  const { data: addons } = useAddons();
  const [bridgeStatus, setBridgeStatus] = useState(
    streamEngineManager.bridgeStatus,
  );

  useEffect(() => {
    streamEngineManager.detectBridge().then(() => {
      setBridgeStatus(streamEngineManager.bridgeStatus);
    });
    const timer = setInterval(
      () => setBridgeStatus(streamEngineManager.bridgeStatus),
      5000,
    );
    return () => clearInterval(timer);
  }, []);

  const bridgeReady = bridgeStatus === "available";
  const bridgePresentation = getBridgeStatusPresentation(bridgeStatus);
  const bridgeColor =
    bridgePresentation.tone === "success"
      ? colors.success
      : bridgePresentation.tone === "error"
        ? colors.error
        : colors.warning;

  return (
    <Pressable
      style={[
        styles.sourceStatus,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
      onPress={() => router.push("/sources" as any)}
      accessibilityRole="button"
      accessibilityLabel="Open Sources & Devices settings"
    >
      <View style={styles.sourceStatusItem}>
        <Ionicons
          name="extension-puzzle-outline"
          size={18}
          color={colors.tint}
        />
        <View style={styles.sourceStatusCopy}>
          <Text style={[styles.sourceStatusTitle, { color: colors.text }]}>
            {addons?.length ?? 0} add-ons
          </Text>
          <Text
            style={[styles.sourceStatusText, { color: colors.textSecondary }]}
          >
            Content sources
          </Text>
        </View>
      </View>
      <View style={styles.sourceStatusDivider} />
      <View style={styles.sourceStatusItem}>
        <View style={[styles.bridgeDot, { backgroundColor: bridgeColor }]} />
        <View style={styles.sourceStatusCopy}>
          <Text style={[styles.sourceStatusTitle, { color: colors.text }]}>
            {bridgePresentation.title}
          </Text>
          <Text
            style={[styles.sourceStatusText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {bridgeReady
              ? streamServerUrl || streamEngineManager.getBridgeUrl()
              : bridgePresentation.detail}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function HomeProviderRails({ type }: { type: "movie" | "series" }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: addons } = useAddons();

  const catalogRows = useMemo(() => {
    const rows: {
      catalog: CatalogDefinition;
      addon: InstalledAddon;
    }[] = [];

    addons?.forEach((addon) => {
      addon.manifest.catalogs.forEach((catalog) => {
        if (catalog.type === type) {
          rows.push({ catalog, addon });
        }
      });
    });

    return rows.slice(0, 5);
  }, [addons, type]);

  if (catalogRows.length === 0) return null;

  return (
    <View style={styles.providerRailSection}>
      <View style={styles.providerRailHeader}>
        <View>
          <Text style={[styles.sectionEyebrow, { color: colors.tint }]}>
            SOURCES
          </Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            From your providers
          </Text>
        </View>
        <Pressable
          style={[
            styles.discoverShortcut,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={() => router.push("/discover")}
          accessibilityRole="button"
          accessibilityLabel="Open Discover"
        >
          <Text style={[styles.discoverShortcutText, { color: colors.tint }]}>
            Discover
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.tint} />
        </Pressable>
      </View>

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

// ─── Home Content ─────────────────────────────────────────────────────────────
function HomeContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const numColumns = useResponsiveColumns();
  const { t } = useTranslation();

  const { colors } = useTheme();
  const [activeFilter, setActiveFilter] = useState<"movie" | "series">("movie");
  const [refreshing, setRefreshing] = useState(false);
  const {
    data: infiniteData,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteCatalog(activeFilter);

  const flatData =
    infiniteData?.pages.flatMap(
      (page: { metas: MetaPreview[] }) => page.metas,
    ) ?? [];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    setRefreshing(false);
  }, [queryClient]);

  if (!isHydrated) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SkeletonCardGrid count={6} />
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

  const heroItem = flatData?.[0];
  const gridData = flatData.slice(heroItem ? 1 : 0);

  return (
    <FlatList
      testID="home-grid"
      style={[styles.flatList, { backgroundColor: colors.background }]}
      data={gridData}
      keyExtractor={(item, index) => `${item.id}-${index}`}
      key={`grid-${numColumns}`}
      numColumns={numColumns}
      columnWrapperStyle={
        numColumns > 1
          ? {
              backgroundColor: colors.background,
              gap: 16,
              paddingHorizontal: 16,
            }
          : undefined
      }
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 40, // More padding for bottom spinner
        backgroundColor: colors.background,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.tint}
          colors={[colors.tint]}
        />
      }
      ListHeaderComponent={
        <View
          style={[styles.homeHeader, { backgroundColor: colors.background }]}
        >
          <OfflineBanner />

          {heroItem && <HomeHeroBanner item={heroItem} />}

          <SourceBridgeStatusCard />

          <ContinueWatchingRow />

          {isAuthenticated && isHydrated && (
            <FilterChipBar
              options={[
                { label: t("home.filters.movies"), value: "movie" },
                { label: t("home.filters.series"), value: "series" },
              ]}
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as "movie" | "series")}
              containerStyle={styles.homeFilterBar}
            />
          )}

          <HomeProviderRails type={activeFilter} />

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionEyebrow, { color: colors.tint }]}>
              RECOMMENDED
            </Text>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {activeFilter === "movie"
                ? t("home.sections.popularMovies")
                : t("home.sections.topTVShows")}
            </Text>
          </View>

          {isLoading && <SkeletonCardGrid count={numColumns * 3} />}

          {flatData.length === 0 && !isLoading && (
            <EmptyState
              icon="cube-outline"
              title={t("home.empty.title")}
              description={t("home.empty.description")}
              actionLabel={t("home.empty.action")}
              onAction={() => router.push("/addons")}
            />
          )}
        </View>
      }
      renderItem={({ item }) => <CatalogItemCard item={item} />}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={() =>
        isFetchingNextPage ? (
          <View style={{ paddingVertical: 20 }}>
            <SkeletonCardGrid count={numColumns} />
          </View>
        ) : null
      }
      initialNumToRender={numColumns * 3}
      maxToRenderPerBatch={numColumns * 2}
      windowSize={5}
    />
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
  flatList: { flex: 1 },
  homeHeader: {
    flex: 1,
  },
  // Section header
  sectionHeader: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 14,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
  },
  sourceStatus: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 20,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 18px 36px rgba(44, 34, 54, 0.12)" }
      : {}),
  },
  sourceStatusItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  sourceStatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  sourceStatusDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(127,111,145,0.18)",
  },
  sourceStatusTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  sourceStatusText: {
    fontSize: 11,
    marginTop: 2,
  },
  bridgeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  homeFilterBar: {
    marginBottom: 8,
  },
  providerRailSection: {
    marginTop: 4,
    marginBottom: 4,
  },
  providerRailHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  discoverShortcut: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  discoverShortcutText: {
    fontSize: 13,
    fontWeight: "800",
  },
});
