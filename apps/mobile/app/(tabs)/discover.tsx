import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { useState, useCallback } from "react";
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

function DiscoverContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: addons, isLoading } = useAddons();
  const [refreshing, setRefreshing] = useState(false);
  const [activeType, setActiveType] = useState<"all" | "movie" | "series">(
    "all",
  );

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
      <View style={{ flex: 1, backgroundColor: "#010101", paddingTop: 16 }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: "#010101" }}>
        <EmptyState
          icon="play-circle"
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
      <View style={{ flex: 1, backgroundColor: "#010101", paddingTop: 16 }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  // Deduplicate catalogs across all addons (Global Catalog rows)
  const uniqueCatalogsMap = new Map<
    string,
    { catalog: CatalogDefinition; addon: InstalledAddon }
  >();
  const nameCounts = new Map<string, number>();

  addons?.forEach((addon) => {
    addon.manifest.catalogs.forEach((catalog) => {
      // Respect the active filter
      if (activeType !== "all" && catalog.type !== activeType) return;

      const key = `${catalog.type}-${catalog.id}`;
      if (!uniqueCatalogsMap.has(key)) {
        uniqueCatalogsMap.set(key, { catalog, addon });
        nameCounts.set(catalog.name, (nameCounts.get(catalog.name) || 0) + 1);
      }
    });
  });

  const catalogRows = Array.from(uniqueCatalogsMap.values()).map((row) => {
    const isDuplicateName = (nameCounts.get(row.catalog.name) || 0) > 1;
    if (isDuplicateName || activeType === "all") {
      const typeLabel =
        row.catalog.type === "movie"
          ? "Movies"
          : row.catalog.type === "series"
            ? "TV Shows"
            : row.catalog.type;

      // Only append if the name doesn't already contain it
      const hasTypeInName = row.catalog.name
        .toLowerCase()
        .includes(typeLabel.toLowerCase());
      const name = hasTypeInName
        ? row.catalog.name
        : `${row.catalog.name} ${typeLabel}`;

      return {
        ...row,
        catalog: { ...row.catalog, name },
      };
    }
    return row;
  });

  if (catalogRows.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#010101" }}>
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
      style={{ flex: 1, backgroundColor: "#010101" }}
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

      <View style={styles.filterBar}>
        <FilterChip
          label="All"
          active={activeType === "all"}
          onPress={() => setActiveType("all")}
        />
        <FilterChip
          label="Movies"
          active={activeType === "movie"}
          onPress={() => setActiveType("movie")}
        />
        <FilterChip
          label="TV Shows"
          active={activeType === "series"}
          onPress={() => setActiveType("series")}
        />
      </View>

      {/* Hero Banner featuring first catalog's first item of the filtered set */}
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

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: "#010101",
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterChipActive: {
    backgroundColor: "#00f2ff",
    borderColor: "#00f2ff",
  },
  filterText: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "700",
  },
  filterTextActive: {
    color: "#000000",
  },
});

export default function DiscoverScreen() {
  return (
    <ErrorBoundary>
      <Stack.Screen options={{ headerShown: false }} />
      <DiscoverContent />
    </ErrorBoundary>
  );
}
