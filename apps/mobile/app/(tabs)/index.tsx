import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  useWindowDimensions,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useInfiniteCatalog } from "../../hooks/useInfiniteCatalog";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import type { MetaPreview } from "@streamer/shared";
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { FilterChipBar } from "../../components/ui/FilterChipBar";
import { SkeletonCardGrid } from "../../components/ui/SkeletonLoader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { Ionicons } from "@expo/vector-icons";
import { WatchProgressBar } from "../../components/ui/WatchProgressBar";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useTheme } from "../../hooks/useTheme";
import { useAddons } from "../../hooks/useAddons";
import { streamEngineManager } from "../../services/streamEngine/StreamEngineManager";

import { HomeHeroBanner } from "../../components/catalog/HomeHeroBanner";
import { CatalogItemCard } from "../../components/catalog/CatalogItemCard";

function SourceBridgeStatusCard() {
  const { colors } = useTheme();
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

  return (
    <View
      style={[
        styles.sourceStatus,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <View style={styles.sourceStatusItem}>
        <Ionicons
          name="extension-puzzle-outline"
          size={18}
          color={colors.tint}
        />
        <View>
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
        <View
          style={[
            styles.bridgeDot,
            { backgroundColor: bridgeReady ? colors.success : colors.warning },
          ]}
        />
        <View>
          <Text style={[styles.sourceStatusTitle, { color: colors.text }]}>
            {bridgeReady ? "Bridge ready" : "Bridge needed"}
          </Text>
          <Text
            style={[styles.sourceStatusText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {streamServerUrl || streamEngineManager.getBridgeUrl()}
          </Text>
        </View>
      </View>
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
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const { colors, isDark } = useTheme();
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

  return (
    <FlatList
      testID="home-grid"
      style={[styles.flatList, { backgroundColor: colors.background }]}
      data={flatData.slice(isDesktop && heroItem ? 1 : 0)}
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
          style={[styles.container, { backgroundColor: colors.background }]}
        >
          <OfflineBanner />
          <SourceBridgeStatusCard />
          <ContinueWatchingRow />

          {/* Desktop hero banner */}
          {isDesktop && heroItem && <HomeHeroBanner item={heroItem} />}

          {/* Section title */}
          {isDesktop && (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {activeFilter === "movie"
                  ? t("home.sections.popularMovies")
                  : t("home.sections.topTVShows")}
              </Text>
            </View>
          )}

          {/* Filter chips */}
          {isAuthenticated && isHydrated && (
            <FilterChipBar
              options={[
                { label: t("home.filters.movies"), value: "movie" },
                { label: t("home.filters.series"), value: "series" },
              ]}
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as "movie" | "series")}
            />
          )}

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
  // Section header
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0,
  },
  sourceStatus: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 18,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  sourceStatusItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  sourceStatusDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.12)",
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
});
