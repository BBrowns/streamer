import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useCallback, memo } from "react";
import { useCatalog } from "../../hooks/useCatalog";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import type { MetaPreview } from "@streamer/shared";
import { SkeletonCardGrid } from "../../components/ui/SkeletonLoader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { OfflineBanner } from "../../components/ui/OfflineBanner";

/** Responsive column count based on screen width */
function useResponsiveColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 480) return 3;
  return 2;
}

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

  const { data: movies, isLoading } = useCatalog("movie");

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
              tintColor="#818cf8"
              colors={["#818cf8"]}
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
  container: { flex: 1, backgroundColor: "#050510" },
  cardContainer: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#141423",
  },
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardInfo: { padding: 8 },
  cardTitle: { color: "#f8fafc", fontWeight: "600", fontSize: 13 },
  ratingContainer: { marginTop: 4 },
  ratingText: { color: "#fbbf24", fontSize: 11, fontWeight: "600" },
  authContainer: {
    flex: 1,
    backgroundColor: "#050510",
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
    backgroundColor: "#818cf8",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#818cf8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  authButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 16 },
});
