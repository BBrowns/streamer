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
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuthStore } from "../../stores/authStore";
import { useLibrary, useRemoveFromLibrary } from "../../hooks/useLibrary";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import type { LibraryItem } from "@streamer/shared";
import * as Haptics from "expo-haptics";
import { useDownloadStore } from "../../stores/downloadStore";
import { Typography } from "../../components/ui/Typography";
import { GlassPanel } from "../../components/ui/GlassPanel";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Theme } from "../../constants/DesignSystem";

/** Responsive column count based on screen width */
function useResponsiveColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 480) return 3;
  return 2;
}

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
    <View style={styles.cardWrapper}>
      <Card
        title={item.title}
        subtitle={item.type === "movie" ? "🎬 Movie" : "📺 Series"}
        image={item.poster ?? undefined}
        onPress={() => router.push(`/detail/${item.type}/${itemId}`)}
        style={styles.card}
      />
      <View style={styles.cardOverlay}>
        {isDownloading && (
          <View style={styles.downloadStatusRow}>
            <View style={styles.progressContainer}>
              <View
                style={[styles.progressBar, { width: `${progress * 100}%` }]}
              />
            </View>
            <Typography
              variant="caption"
              weight="800"
              color={Theme.colors.primary}
              style={styles.progressText}
            >
              {Math.round(progress * 100)}%
            </Typography>
          </View>
        )}
        {isCompleted && (
          <GlassPanel intensity="high" style={styles.downloadBadge}>
            <Ionicons
              name="cloud-offline"
              size={12}
              color={Theme.colors.primary}
            />
            <Typography
              variant="caption"
              color={Theme.colors.primary}
              weight="800"
              style={{ marginLeft: 4 }}
            >
              OFFLINE
            </Typography>
          </GlassPanel>
        )}
      </View>
      <Pressable
        onLongPress={handleLongPress}
        style={StyleSheet.absoluteFill}
        delayLongPress={200}
      />
    </View>
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

  const numColumns = useResponsiveColumns();

  if (!isAuthenticated) {
    return (
      <View style={styles.authContainer}>
        <Typography variant="h1" align="center" style={{ marginBottom: 12 }}>
          📚 Library
        </Typography>
        <Typography
          variant="body"
          color={Theme.colors.textMuted}
          align="center"
          style={{ marginBottom: 32 }}
        >
          Sign in to access your watchlist and synchronized collection
        </Typography>
        <Button
          title="Sign In"
          onPress={() => router.push("/login")}
          size="lg"
          style={styles.authButton}
        />
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
        key={`library-grid-${numColumns}`}
        data={filteredItems as any[]}
        keyExtractor={(item) => item.id || item.itemId}
        numColumns={numColumns}
        columnWrapperStyle={[
          styles.columnWrapper,
          numColumns > 2 && { justifyContent: "flex-start" },
        ]}
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
                {[
                  { id: "all", label: "All" },
                  { id: "movie", label: "Movies" },
                  { id: "show", label: "Series" },
                  { id: "offline", label: "Offline" },
                ].map((filter) => (
                  <Pressable
                    key={filter.id}
                    onPress={() => {
                      setActiveFilter(filter.id as any);
                      Haptics.selectionAsync();
                    }}
                  >
                    <GlassPanel
                      intensity={activeFilter === filter.id ? "high" : "low"}
                      style={[
                        styles.filterChip,
                        activeFilter === filter.id && styles.filterChipActive,
                      ]}
                      bordered={activeFilter === filter.id}
                    >
                      <Typography
                        variant="caption"
                        weight="800"
                        color={
                          activeFilter === filter.id
                            ? Theme.colors.black
                            : Theme.colors.textMuted
                        }
                      >
                        {filter.label}
                      </Typography>
                    </GlassPanel>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="bookmark-outline"
            title="Your library is empty"
            description={
              activeFilter === "all"
                ? "Browse the Discover tab and add movies & shows to your library."
                : `No saved ${activeFilter === "movie" ? "movies" : "series"} found.`
            }
          />
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
  container: { flex: 1, backgroundColor: Theme.colors.background },
  authContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  authButton: {
    width: "100%",
    maxWidth: 320,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  columnWrapper: { paddingHorizontal: 12, gap: 10, marginBottom: 10 },
  listContent: { paddingBottom: 24 },
  filterContainer: { marginBottom: 16 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Theme.radius.full,
  },
  filterChipActive: {
    backgroundColor: Theme.colors.primary,
  },
  cardWrapper: {
    flex: 1,
    maxWidth: Platform.OS === "web" ? 180 : "48%",
  },
  card: {
    width: "100%",
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  downloadStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 6,
    borderRadius: 8,
    gap: 8,
  },
  progressContainer: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: Theme.colors.primary,
  },
  progressText: {
    minWidth: 32,
    textAlign: "right",
  },
  downloadBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(0, 242, 255, 0.2)",
  },
});
