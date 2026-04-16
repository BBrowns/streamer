import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DeviceEventEmitter } from "react-native";
import { SearchOverlay } from "../../components/search/SearchOverlay";
import { CatalogRow } from "../../components/catalog/CatalogRow";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { SkeletonRow } from "../../components/ui/SkeletonLoader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { useAddons } from "../../hooks/useAddons";
import type { CatalogDefinition, InstalledAddon } from "@streamer/shared";
import { HeroBanner } from "../../components/catalog/HeroBanner";
import { hapticImpactLight } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import { FilterChipBar } from "../../components/ui/FilterChipBar";

const useFilters = () => {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { label: t("discover.filters.all"), value: null as FilterType },
      { label: t("discover.filters.movies"), value: "movie" as FilterType },
      { label: t("discover.filters.series"), value: "series" as FilterType },
    ],
    [t],
  );
};

type FilterType = "movie" | "series" | null;

function DiscoverContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const { t } = useTranslation();
  const filters = useFilters();
  const queryClient = useQueryClient();
  const { data: addons, isLoading } = useAddons();
  const { colors, isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [searchVisible, setSearchVisible] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("SHOW_SEARCH", () => {
      setSearchVisible(true);
    });
    return () => sub.remove();
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["addons"] }),
      queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["progress"] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  // Collect all catalogs across all addons (Server-Driven UI)
  const allCatalogRows = useMemo(() => {
    const rows: {
      catalog: CatalogDefinition;
      addon: InstalledAddon;
    }[] = [];
    addons?.forEach((addon) => {
      addon.manifest.catalogs.forEach((catalog) => {
        rows.push({ catalog, addon });
      });
    });
    return rows;
  }, [addons]);

  // Apply active filter
  const catalogRows = useMemo(
    () =>
      activeFilter
        ? allCatalogRows.filter((r) => r.catalog.type === activeFilter)
        : allCatalogRows,
    [activeFilter, allCatalogRows],
  );

  // Wait for auth hydration
  if (!isHydrated) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.background, paddingTop: 16 }}
      >
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          size="large"
          icon="film-outline"
          title={t("discover.auth.title")}
          description={t("discover.auth.subtitle")}
          actionLabel={t("discover.auth.button")}
          onAction={() => router.push("/login")}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.background, paddingTop: 16 }}
      >
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (catalogRows.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          size="large"
          icon="search"
          title={t("discover.empty.title")}
          description={t("discover.empty.description")}
          actionLabel={t("discover.empty.action")}
          onAction={() => router.push("/addons")}
        />
      </View>
    );
  }

  return (
    <ScrollView
      testID="discover-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="never"
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

      <SearchOverlay
        isVisible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onSearch={(q) => {
          router.push({ pathname: "/search/results", params: { q } });
        }}
      />

      {/* Quick Filters */}
      <FilterChipBar
        options={filters}
        value={activeFilter}
        onChange={(v) => setActiveFilter(v as FilterType)}
        containerStyle={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingBottom: 12,
          marginTop: 8,
          marginBottom: 0,
        }}
      />

      {/* Hero Banner featuring first catalog's first item */}
      {catalogRows.length > 0 && (
        <HeroBanner catalog={catalogRows[0].catalog} />
      )}

      {/* Continue Watching — always first if there are items */}
      <ContinueWatchingRow />

      {/* Server-Driven catalog rows from installed add-ons */}
      {catalogRows.map(({ catalog, addon }) => (
        <CatalogRow
          key={`${addon.id}-${catalog.type}-${catalog.id}`}
          catalog={catalog}
          addon={addon}
        />
      ))}
    </ScrollView>
  );
}

export default function DiscoverScreen() {
  return (
    <ErrorBoundary>
      <Stack.Screen options={{ headerShown: false }} />
      <DiscoverContent />
    </ErrorBoundary>
  );
}
