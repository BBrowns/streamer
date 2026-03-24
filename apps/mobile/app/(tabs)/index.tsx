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

// ─── Hero Banner ─────────────────────────────────────────────────────────────
const HeroBanner = memo(function HeroBanner({ item }: { item: MetaPreview }) {
  const router = useRouter();
  return (
    <Pressable
      style={styles.hero}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Featured: ${item.name}`}
    >
      <Image
        source={{ uri: item.poster }}
        style={styles.heroImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      {/* gradient overlay */}
      <View style={styles.heroGradient} />
      <View style={styles.heroContent}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroBadgeText}>
            {item.type === "movie" ? "🎬 MOVIE" : "📺 SERIES"}
          </Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {item.name}
        </Text>
        {!!item.imdbRating && (
          <Text style={styles.heroRating}>⭐ {item.imdbRating} IMDb</Text>
        )}
        {!!item.description && (
          <Text style={styles.heroDesc} numberOfLines={3}>
            {item.description}
          </Text>
        )}
        <View style={styles.heroActions}>
          <Pressable
            style={styles.heroPlayBtn}
            onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
          >
            <Ionicons name="play" size={18} color="#000" />
            <Text style={styles.heroPlayText}>Play</Text>
          </Pressable>
          <Pressable
            style={styles.heroInfoBtn}
            onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#fff"
            />
            <Text style={styles.heroInfoText}>More Info</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

// ─── Catalog Card ────────────────────────────────────────────────────────────
const CatalogCard = memo(function CatalogCard({ item }: { item: MetaPreview }) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const isWeb = Platform.OS === "web";

  return (
    <Pressable
      style={[
        styles.cardContainer,
        isWeb && isHovered && styles.cardContainerHovered,
      ]}
      onPress={() => router.push(`/detail/${item.type}/${item.id}`)}
      onPointerEnter={isWeb ? () => setIsHovered(true) : undefined}
      onPointerLeave={isWeb ? () => setIsHovered(false) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}${item.imdbRating ? `, rated ${item.imdbRating}` : ""}`}
      accessibilityHint="Opens details page"
    >
      <View style={{ position: "relative" }}>
        <Image
          source={{ uri: item.poster }}
          style={[
            styles.cardImage,
            isWeb && isHovered && (styles.cardImageHovered as any),
          ]}
          accessibilityIgnoresInvertColors
        />
        <WatchProgressBar itemId={item.id} />
      </View>
      <View style={styles.cardInfo}>
        <Text
          style={[
            styles.cardTitle,
            isWeb && isHovered && styles.cardTitleHovered,
          ]}
          numberOfLines={2}
        >
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
          {isDesktop && heroItem && <HeroBanner item={heroItem} />}

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
      renderItem={({ item }) => <CatalogCard item={item} />}
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
  // Hero
  hero: {
    width: "100%",
    height: 420,
    position: "relative",
    marginBottom: 24,
    backgroundColor: "#111",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "80%",
    backgroundColor: "transparent",
  },
  heroContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 32,
  },
  heroBadge: {
    backgroundColor: "rgba(0,242,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(0,242,255,0.3)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  heroBadgeText: {
    color: "#00f2ff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroRating: {
    color: "#ffd700",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  heroDesc: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 560,
  },
  heroActions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  heroPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#00f2ff",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  heroPlayText: {
    color: "#000",
    fontWeight: "800",
    fontSize: 15,
  },
  heroInfoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heroInfoText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
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
  // Cards
  cardContainer: {
    flex: 1,
    maxWidth: 240,
    marginHorizontal: 6,
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111118",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardContainerHovered: {
    borderColor: "#00f2ff",
    transform: [{ scale: 1.05 }],
    zIndex: 10,
    boxShadow: "0 10px 30px rgba(0, 242, 255, 0.25)",
  } as any,
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(255,255,255,0.05)",
    transition: "all 0.4s cubic-bezier(0.2, 1, 0.3, 1)",
  } as any,
  cardImageHovered: {
    filter: "brightness(1.15) contrast(1.05)",
  },
  cardInfo: { padding: 8 },
  cardTitle: {
    color: "#f1f5f9",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: -0.2,
    transition: "color 0.2s ease",
  } as any,
  cardTitleHovered: {
    color: "#00f2ff",
  },
  ratingContainer: { marginTop: 4 },
  ratingText: { color: "#ffd600", fontSize: 11, fontWeight: "800" },
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
