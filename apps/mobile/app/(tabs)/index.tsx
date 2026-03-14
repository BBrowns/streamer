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
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, memo } from "react";
import { useCatalog } from "../../hooks/useCatalog";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Typography } from "../../components/ui/Typography";
import { Theme } from "../../constants/DesignSystem";
import type { MetaPreview } from "@streamer/shared";
import { SkeletonCardGrid } from "../../components/ui/SkeletonLoader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { Button } from "../../components/ui/Button";

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
    <Card
      title={item.name}
      subtitle={item.imdbRating ? `⭐ ${item.imdbRating}` : undefined}
      image={item.poster}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      style={styles.card}
    />
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
        <View style={styles.authHeader}>
          <Ionicons
            name="play-circle"
            size={56}
            color={Theme.colors.primary}
            style={styles.authIcon}
          />
          <Typography variant="h1" style={{ fontSize: 44 }}>
            Streamer
          </Typography>
        </View>
        <Typography
          variant="body"
          color={Theme.colors.textMuted}
          align="center"
          style={styles.authSubtitle}
        >
          Your universe of content, aggregated from the open web, delivered in a
          premium experience.
        </Typography>
        <Button
          title="Get Started"
          onPress={() => router.push("/login")}
          size="lg"
          style={styles.authButton}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />

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
  container: { flex: 1, backgroundColor: Theme.colors.background },
  card: {
    flex: 1,
    marginHorizontal: 6,
    marginBottom: 16,
  },
  authContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  authHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  authIcon: {
    marginRight: 16,
  },
  authSubtitle: {
    marginBottom: 48,
    maxWidth: 500,
  },
  authButton: {
    paddingHorizontal: 48,
    marginTop: 16,
    width: "100%",
    maxWidth: 300,
  },
});
