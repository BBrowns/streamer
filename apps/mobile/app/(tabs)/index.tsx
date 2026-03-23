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

const CatalogCard = memo(function CatalogCard({ item }: { item: MetaPreview }) {
  const router = useRouter();

  return (
    <Pressable
      style={styles.cardContainer}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.imdbRating ? `, rated ${item.imdbRating}` : ""}`}
      accessibilityHint="Opens details page"
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.cardImage}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </Text>
        {!!item.imdbRating && (
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingText}>⭐ {item.imdbRating}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

function HomeContent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const numColumns = useResponsiveColumns();

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
        <Text style={styles.authTitle} accessibilityRole="header">
          🎬 Streamer
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

  return (
    <View style={styles.container}>
      <OfflineBanner />

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
          emoji="📦"
          title="No Content Found"
          description="Install some add-ons in Settings to start browsing."
          actionLabel="Manage Add-ons"
          onAction={() => router.push("/addons")}
        />
      )}

      {!isLoading && movies && movies.length > 0 && (
        <FlatList
          testID="home-grid"
          data={movies}
          keyExtractor={(item) => item.id}
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={handleRefresh}
              tintColor="#00f2ff"
              colors={["#00f2ff"]}
            />
          }
          renderItem={({ item }) => <CatalogCard item={item} />}
          initialNumToRender={numColumns * 3}
          maxToRenderPerBatch={numColumns * 2}
          windowSize={5}
        />
      )}
    </View>
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
  container: { flex: 1, backgroundColor: "#010101" },
  cardContainer: {
    flex: 1,
    marginHorizontal: 6,
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardInfo: { padding: 8 },
  cardTitle: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: -0.2,
  },
  ratingContainer: { marginTop: 4 },
  ratingText: { color: "#ffd600", fontSize: 11, fontWeight: "800" },
  filterContainer: { marginBottom: 16, marginTop: 8 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0, 242, 255, 0.2)",
  },
  filterChipActive: { backgroundColor: "#00f2ff", borderColor: "#00f2ff" },
  filterChipText: { color: "#888888", fontSize: 13, fontWeight: "800" },
  filterChipTextActive: { color: "#000000" },
  authContainer: {
    flex: 1,
    backgroundColor: "#010101",
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
