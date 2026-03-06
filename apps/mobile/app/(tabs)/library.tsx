import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../stores/authStore";
import { useLibrary, useRemoveFromLibrary } from "../../hooks/useLibrary";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import type { LibraryItem } from "@streamer/shared";
import * as Haptics from "expo-haptics";

function LibraryCard({
  item,
  onRemove,
}: {
  item: LibraryItem;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "View Details", "Remove from Library"],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
          title: item.title,
          message: "What would you like to do?",
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            router.push(`/detail/${item.type}/${item.itemId}`);
          } else if (buttonIndex === 2) {
            onRemove(item.itemId);
          }
        },
      );
    } else {
      Alert.alert(item.title, "What would you like to do?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "View Details",
          onPress: () => router.push(`/detail/${item.type}/${item.itemId}`),
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onRemove(item.itemId),
        },
      ]);
    }
  };

  return (
    <Pressable
      style={styles.cardContainer}
      onPress={() => router.push(`/detail/${item.type}/${item.itemId}`)}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. Long press for options`}
      accessibilityHint="Opens detail page"
    >
      <Image
        source={{ uri: item.poster ?? undefined }}
        style={styles.cardImage}
        accessibilityLabel={`${item.title} poster`}
      />
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardSubtitle}>
          {item.type === "movie" ? "🎬 Movie" : "📺 Series"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useLibrary();
  const removeFromLibrary = useRemoveFromLibrary();
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "movie" | "show">(
    "all",
  );

  const handleRemove = useCallback(
    (itemId: string) => {
      removeFromLibrary.mutate(itemId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [removeFromLibrary],
  );

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (activeFilter === "all") return items;
    return items.filter((item) => item.type === activeFilter);
  }, [items, activeFilter]);

  if (!isAuthenticated) {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.authIcon}>📚</Text>
        <Text style={styles.authTitle}>Your Library</Text>
        <Text style={styles.authSubtitle}>
          Sign in to access your watchlist
        </Text>
        <Pressable
          style={styles.signInButton}
          onPress={() => router.push("/login")}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#818cf8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <ContinueWatchingRow />
            <View style={styles.filterContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                <Pressable
                  style={[
                    styles.filterChip,
                    activeFilter === "all" && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setActiveFilter("all");
                    Haptics.selectionAsync();
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === "all" && styles.filterChipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </Pressable>
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
                    activeFilter === "show" && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setActiveFilter("show");
                    Haptics.selectionAsync();
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === "show" && styles.filterChipTextActive,
                    ]}
                  >
                    Series
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No Items Yet</Text>
            <Text style={styles.emptySubtitle}>
              {activeFilter === "all"
                ? "Browse the Discover tab and add movies & shows to your library."
                : `No saved ${activeFilter === "movie" ? "movies" : "series"} found.`}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await queryClient.invalidateQueries({ queryKey: ["library"] });
              await queryClient.invalidateQueries({ queryKey: ["progress"] });
              setRefreshing(false);
            }}
            tintColor="#818cf8"
            colors={["#818cf8"]}
          />
        }
        renderItem={({ item }) => (
          <LibraryCard item={item} onRemove={handleRemove} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050510" },
  authContainer: {
    flex: 1,
    backgroundColor: "#050510",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  authIcon: { fontSize: 48, marginBottom: 12 },
  authTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  authSubtitle: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  signInButton: {
    backgroundColor: "#818cf8",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  signInButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 15 },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#050510",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  columnWrapper: { paddingHorizontal: 12, gap: 10, marginBottom: 10 },
  listContent: { paddingBottom: 24 },
  filterContainer: { marginBottom: 16 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    backgroundColor: "rgba(129,140,248,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.2)",
  },
  filterChipActive: { backgroundColor: "#818cf8", borderColor: "#818cf8" },
  filterChipText: { color: "#a1a1aa", fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: "#ffffff" },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 64,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptySubtitle: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  cardContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#141423",
    minHeight: 44,
  },
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardInfo: { padding: 8 },
  cardTitle: { color: "#f8fafc", fontSize: 13, fontWeight: "600" },
  cardSubtitle: { color: "#94a3b8", fontSize: 11, marginTop: 4 },
});
