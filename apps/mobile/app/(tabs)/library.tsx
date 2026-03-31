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
import { useRouter, useNavigation } from "expo-router";
import { useAuthStore } from "../../stores/authStore";
import {
  useLibrary,
  useRemoveFromLibrary,
  useRemoveBulkFromLibrary,
} from "../../hooks/useLibrary";
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, useEffect } from "react";
import type { LibraryItem } from "@streamer/shared";
import * as Haptics from "expo-haptics";
import { useDownloadStore } from "../../stores/downloadStore";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../../components/ui/EmptyState";

import { LibraryCard } from "../../components/library/LibraryCard";
import {
  SkeletonCardGrid,
  SkeletonRow,
} from "../../components/ui/SkeletonLoader";
import { hapticSelection, hapticSuccess } from "../../lib/haptics";

export default function LibraryScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useLibrary();
  const removeFromLibrary = useRemoveFromLibrary();
  const bulkRemoveFromLibrary = useRemoveBulkFromLibrary();
  const tasks = useDownloadStore((s) => s.tasks);
  const [refreshing, setRefreshing] = useState(false);
  const numColumns = useResponsiveColumns();
  const [activeFilter, setActiveFilter] = useState<
    "all" | "movie" | "show" | "offline"
  >("all");

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Setup header button
  useEffect(() => {
    if (!isAuthenticated) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          style={{ marginRight: 16 }}
          onPress={() => {
            hapticSelection();
            if (isSelectionMode) {
              setIsSelectionMode(false);
              setSelectedIds(new Set());
            } else {
              setIsSelectionMode(true);
            }
          }}
        >
          <Text style={{ color: "#00f2ff", fontSize: 16, fontWeight: "600" }}>
            {isSelectionMode ? "Cancel" : "Select"}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, isSelectionMode, isAuthenticated]);

  const handleRemove = useCallback(
    (itemId: string, isDownload?: boolean) => {
      if (isDownload) {
        const task = Object.values(tasks).find(
          (t) => t.mediaInfo.itemId === itemId,
        );
        if (task) {
          const { downloadService } = require("../../services/DownloadService");
          downloadService.deleteDownload(task.id);
        }
      }
      removeFromLibrary.mutate(itemId);
      hapticSuccess();
    },
    [removeFromLibrary, tasks],
  );

  const toggleSelect = useCallback((itemId: string) => {
    hapticSelection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "Remove Items",
      `Are you sure you want to remove ${selectedIds.size} items from your library?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            const idsArray = Array.from(selectedIds);

            // Delete offline downloads if necessary
            idsArray.forEach((id) => {
              const task = Object.values(tasks).find(
                (t) => t.mediaInfo.itemId === id,
              );
              if (task) {
                const {
                  downloadService,
                } = require("../../services/DownloadService");
                downloadService.deleteDownload(task.id);
              }
            });

            bulkRemoveFromLibrary.mutate(idsArray, {
              onSuccess: () => {
                hapticSuccess();
                setIsSelectionMode(false);
                setSelectedIds(new Set());
              },
            });
          },
        },
      ],
    );
  }, [selectedIds, tasks, bulkRemoveFromLibrary]);

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
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <SkeletonRow />
        </View>
        <SkeletonCardGrid count={9} />
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
                    hapticSelection();
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
                    hapticSelection();
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
                    hapticSelection();
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
                    hapticSelection();
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
          <EmptyState
            icon="bookmarks-outline"
            title="No Items Yet"
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
              hapticSelection();
              await queryClient.invalidateQueries({ queryKey: ["library"] });
              await queryClient.invalidateQueries({ queryKey: ["progress"] });
              setRefreshing(false);
            }}
            tintColor="#00f2ff"
            colors={["#00f2ff"]}
          />
        }
        renderItem={({ item }) => (
          <LibraryCard
            item={item}
            onRemove={handleRemove}
            isSelectionMode={isSelectionMode}
            isSelected={selectedIds.has(item.itemId || item.id)}
            onToggleSelect={toggleSelect}
          />
        )}
      />

      {isSelectionMode && (
        <View style={styles.floatingActionBar}>
          <Text style={styles.fabText}>{selectedIds.size} Selected</Text>
          <Pressable
            style={[
              styles.fabButton,
              selectedIds.size === 0 && styles.fabButtonDisabled,
            ]}
            onPress={handleBulkDelete}
            disabled={selectedIds.size === 0}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={selectedIds.size === 0 ? "#6b7280" : "#ffffff"}
            />
            <Text
              style={[
                styles.fabButtonText,
                selectedIds.size === 0 && styles.fabButtonTextDisabled,
              ]}
            >
              Delete
            </Text>
          </Pressable>
        </View>
      )}
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
  floatingActionBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 24 : 16,
    left: 16,
    right: 16,
    backgroundColor: "#ef4444",
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  fabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  fabButtonDisabled: {
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  fabButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  fabButtonTextDisabled: {
    color: "#6b7280",
  },
});
