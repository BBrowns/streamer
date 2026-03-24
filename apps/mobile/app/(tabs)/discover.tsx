import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { useState, useCallback, useMemo } from "react";
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
import { Ionicons } from "@expo/vector-icons";

const FILTERS = [
  { label: "All", type: null },
  { label: "Movies", type: "movie" },
  { label: "Series", type: "series" },
] as const;

type FilterType = (typeof FILTERS)[number]["type"];

function DiscoverContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: addons, isLoading } = useAddons();
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["addons"] }),
      queryClient.invalidateQueries({ queryKey: ["catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["progress"] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  // Wait for auth hydration
  if (!isHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", paddingTop: 16 }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <EmptyState
          icon="film-outline"
          title="Welcome to Streamer"
          description="Sign in to discover movies and shows from your add-ons."
          actionLabel="Sign In"
          onAction={() => router.push("/login")}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", paddingTop: 16 }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  // Collect all catalogs across all addons (Server-Driven UI)
  const allCatalogRows: {
    catalog: CatalogDefinition;
    addon: InstalledAddon;
  }[] = [];
  addons?.forEach((addon) => {
    addon.manifest.catalogs.forEach((catalog) => {
      allCatalogRows.push({ catalog, addon });
    });
  });

  // Apply active filter
  const catalogRows = useMemo(
    () =>
      activeFilter
        ? allCatalogRows.filter((r) => r.catalog.type === activeFilter)
        : allCatalogRows,
    [activeFilter, allCatalogRows.length],
  );

  if (catalogRows.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <EmptyState
          icon="search"
          title="No Content Sources"
          description="Install an add-on in Settings to start discovering content."
          actionLabel="Manage Add-ons"
          onAction={() => router.push("/addons")}
        />
      </View>
    );
  }

  return (
    <ScrollView
      testID="discover-screen"
      style={{ flex: 1, backgroundColor: "#000000" }}
      contentInsetAdjustmentBehavior="never"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#00f2ff"
          colors={["#00f2ff"]}
        />
      }
    >
      <OfflineBanner />

      {/* Quick Filters */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.label}
              style={[
                styles.filterChip,
                activeFilter === f.type && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(f.type)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === f.type && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

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

const styles = StyleSheet.create({
  filterSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  filterChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterChipActive: {
    backgroundColor: "#00f2ff",
    borderColor: "#00f2ff",
  },
  filterChipText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: "#000000",
  },
});
