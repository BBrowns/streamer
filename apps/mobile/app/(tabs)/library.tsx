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
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import type { LibraryItem } from "@streamer/shared";
import * as Haptics from "expo-haptics";
import { useDownloadStore } from "../../stores/downloadStore";
import { Ionicons } from "@expo/vector-icons";

function LibraryCard({
  item,
  onRemove,
}: {
  item: LibraryItem;
  onRemove: (id: string, isDownload?: boolean) => void;
}) {
  const router = useRouter();
  const itemId = item.itemId || item.id;

  // Check download status for this item
  // Note: We might have multiple streams for one item, but the store usually tracks per-item as well if we simplify.
  // For now, we'll just check if ANY task for this itemId exists if we were tracking by infoHash.
  // Actually, for the library view, we'll try to find a task that matches this itemId.
  const tasks = useDownloadStore((state) => state.tasks);
  const task = Object.values(tasks).find((t) => t.mediaInfo.itemId === itemId);

  const isDownloading = task?.status === "Downloading";
  const isCompleted = task?.status === "Completed";
  const progress = task?.progress || 0;

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
            router.push(`/detail/${item.type}/${itemId}`);
          } else if (buttonIndex === 2) {
            onRemove(itemId, !!task);
          }
        },
      );
    } else {
      Alert.alert(item.title, "What would you like to do?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "View Details",
          onPress: () => router.push(`/detail/${item.type}/${itemId}`),
        },
        {
          text: task ? "Remove Download" : "Remove",
          style: "destructive",
          onPress: () => onRemove(itemId, !!task),
        },
      ]);
    }
  };

  return (
    <Pressable
      style={styles.cardContainer}
      onPress={() => router.push(`/detail/${item.type}/${itemId}`)}
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
        <View style={styles.cardTypeRow}>
          <Ionicons
            name={item.type === "movie" ? "film-outline" : "tv-outline"}
            size={11}
            color="#6b7280"
          />
          <Text style={styles.cardSubtitle}>
            {item.type === "movie" ? "Movie" : "Series"}
          </Text>
        </View>
        {isDownloading && (
          <View style={styles.progressContainer}>
            <View
              style={[styles.progressBar, { width: `${progress * 100}%` }]}
            />
          </View>
        )}
        {isCompleted && (
          <View style={styles.downloadBadge}>
            <Ionicons name="arrow-down-circle" size={13} color="#4ade80" />
            <Text style={styles.downloadBadgeText}>Offline</Text>
          </View>
        )}
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
  const tasks = useDownloadStore((s) => s.tasks);
  const [refreshing, setRefreshing] = useState(false);
  const numColumns = useResponsiveColumns();
  const [activeFilter, setActiveFilter] = useState<
    "all" | "movie" | "show" | "offline"
  >("all");

  const handleRemove = useCallback(
    (itemId: string, isDownload?: boolean) => {
      if (isDownload) {
        // find task id (which might be infohash)
        const task = Object.values(tasks).find(
          (t) => t.mediaInfo.itemId === itemId,
        );
        if (task) {
          const { downloadService } = require("../../services/DownloadService");
          downloadService.deleteDownload(task.id);
        }
      }
      removeFromLibrary.mutate(itemId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [removeFromLibrary, tasks],
  );

  const filteredItems = useMemo(() => {
    if (activeFilter === "offline") {
      // Map download tasks to a similar structure as LibraryItem
      return Object.values(tasks).map((t) => ({
        ...t.mediaInfo,
        itemId: t.mediaInfo.itemId,
        id: t.id, // using task id for list key
      }));
    }
    if (!items) return [];
    if (activeFilter === "all") return items;
    return items.filter((item) => item.type === activeFilter);
  }, [items, tasks, activeFilter]);

  if (!isAuthenticated) {
    return (
      <View style={styles.authContainer}>
        <Ionicons
          name="bookmarks-outline"
          size={56}
          color="#374151"
          style={{ marginBottom: 16 }}
        />
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
        <ActivityIndicator size="large" color="#00f2ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        key={numColumns} // Force remount cleanly when numColumns changes
        data={filteredItems as any[]}
        keyExtractor={(item) => item.id || item.itemId}
        numColumns={numColumns}
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
                <Pressable
                  style={[
                    styles.filterChip,
                    activeFilter === "offline" && styles.filterChipActive,
                  ]}
                  onPress={() => {
                    setActiveFilter("offline");
                    Haptics.selectionAsync();
                  }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      activeFilter === "offline" && styles.filterChipTextActive,
                    ]}
                  >
                    Offline
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
            tintColor="#00f2ff"
            colors={["#00f2ff"]}
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
    backgroundColor: "#00f2ff",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  signInButtonText: { color: "#000000", fontWeight: "900", fontSize: 15 },
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
  cardTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  cardContainer: {
    flex: 1,
    maxWidth: 260,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
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
  progressContainer: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#00f2ff",
  },
  downloadBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  downloadBadgeText: {
    color: "#4ade80",
    fontSize: 10,
    fontWeight: "700",
  },
});
