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
import * as Haptics from "expo-haptics";
import { useCatalog } from "../../hooks/useCatalog";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import type { MetaPreview } from "@streamer/shared";
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { SkeletonCardGrid } from "../../components/ui/SkeletonLoader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { Ionicons } from "@expo/vector-icons";
import { WatchProgressBar } from "../../components/ui/WatchProgressBar";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";

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
  const isDesktop = Platform.OS === "web" && width >= 1024;

  const [activeFilter, setActiveFilter] = useState<"movie" | "series">("movie");
  const { data: movies, isLoading } = useCatalog(activeFilter);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["catalog"] });
  }, [queryClient]);

  if (!isHydrated) {
    return (
      <View style={styles.container}>
        <SkeletonCardGrid count={6} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.authContainer}>
        <Ionicons
          name="film-outline"
          size={64}
          color="#00f2ff"
          style={{ marginBottom: 16 }}
        />
        <Text style={styles.authTitle} accessibilityRole="header">
          Streamer
        </Text>
        <Text style={styles.authSubtitle}>
          Your universe of content, aggregated from the open web.
        </Text>
        <Pressable
          style={styles.authButton}
          onPress={() => router.push("/login")}
          accessibilityRole="button"
          accessibilityLabel="Get started and sign in"
        >
          <Text style={styles.authButtonText}>Get Started</Text>
        </Pressable>
      </View>
    );
  }

  const heroItem = movies?.[0];

  return (
    <FlatList
      testID="home-grid"
      style={styles.flatList}
      data={movies?.slice(isDesktop && heroItem ? 1 : 0)}
      keyExtractor={(item) => item.id}
      key={`grid-${numColumns}`}
      numColumns={numColumns}
      columnWrapperStyle={
        numColumns > 1 ? { backgroundColor: "#07070e" } : undefined
      }
      contentContainerStyle={{
        paddingHorizontal: 8,
        paddingBottom: 20,
        backgroundColor: "#07070e",
      }}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={handleRefresh}
          tintColor="#00f2ff"
          colors={["#00f2ff"]}
        />
      }
      ListHeaderComponent={
        <View style={styles.container}>
          <OfflineBanner />
          <ContinueWatchingRow />

          {/* Desktop hero banner */}
          {isDesktop && heroItem && <HomeHeroBanner item={heroItem} />}

          {/* Section title */}
          {isDesktop && (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {activeFilter === "movie" ? "Popular Movies" : "Top TV Shows"}
              </Text>
            </View>
          )}

          {/* Filter chips */}
          {isAuthenticated && isHydrated && (
            <View style={styles.filterContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                <Pressable
                  style={[
                    styles.filterChip,
                    activeFilter === "movie" && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setActiveFilter("movie");
                    Haptics.selectionAsync();
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === "movie" && styles.filterChipTextActive,
                    ]}
                  >
                    Movies
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.filterChip,
                    activeFilter === "series" && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setActiveFilter("series");
                    Haptics.selectionAsync();
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === "series" && styles.filterChipTextActive,
                    ]}
                  >
                    TV Shows
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          )}

          {isLoading && <SkeletonCardGrid count={numColumns * 3} />}

          {!!movies && movies.length === 0 && !isLoading && (
            <EmptyState
              icon="cube-outline"
              title="No Content Found"
              description="Install some add-ons in Settings to start browsing."
              actionLabel="Manage Add-ons"
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
  container: { backgroundColor: "#07070e", flex: 1 },
  flatList: { flex: 1, backgroundColor: "#07070e" },
  // Section header
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#f1f5f9",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  filterContainer: { marginBottom: 16, marginTop: 8 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: { backgroundColor: "#00f2ff", borderColor: "#00f2ff" },
  filterChipText: { color: "#6b7280", fontSize: 13, fontWeight: "800" },
  filterChipTextActive: { color: "#000000" },
  authContainer: {
    flex: 1,
    backgroundColor: "#07070e",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  authTitle: {
    fontSize: 36,
    fontWeight: "900",
    color: "#f8fafc",
    marginBottom: 12,
  },
  authSubtitle: {
    fontSize: 16,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  authButton: {
    backgroundColor: "#00f2ff",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
  },
  authButtonText: {
    color: "#000000",
    fontWeight: "900",
    fontSize: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
