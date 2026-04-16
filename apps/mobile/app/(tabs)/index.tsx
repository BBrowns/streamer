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
import { useCallback, memo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useCatalog } from "../../hooks/useCatalog";
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

import { HomeHeroBanner } from "../../components/catalog/HomeHeroBanner";
import { CatalogItemCard } from "../../components/catalog/CatalogItemCard";

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
  const { data: movies, isLoading } = useCatalog(activeFilter);

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

  const heroItem = movies?.[0];

  return (
    <FlatList
      testID="home-grid"
      style={[styles.flatList, { backgroundColor: colors.background }]}
      data={movies?.slice(isDesktop && heroItem ? 1 : 0)}
      keyExtractor={(item) => item.id}
      key={`grid-${numColumns}`}
      numColumns={numColumns}
      columnWrapperStyle={
        numColumns > 1
          ? { backgroundColor: colors.background, gap: 8, paddingHorizontal: 8 }
          : undefined
      }
      contentContainerStyle={{
        paddingHorizontal: 8,
        paddingBottom: 20,
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

          {!!movies && movies.length === 0 && !isLoading && (
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
    letterSpacing: -0.5,
  },
});
