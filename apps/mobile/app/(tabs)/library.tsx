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
import { useTranslation } from "react-i18next";
import {
  useLibrary,
  useAddToLibrary,
  useRemoveFromLibrary,
  useRemoveBulkFromLibrary,
} from "../../hooks/useLibrary";
import { useResponsiveColumns } from "../../hooks/useResponsiveColumns";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, useEffect } from "react";
import type { LibraryItem } from "@streamer/shared";
import * as Haptics from "expo-haptics";
import {
  isTaskOfflinePlayable,
  useDownloadStore,
} from "../../stores/downloadStore";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../../components/ui/EmptyState";
import { useTheme } from "../../hooks/useTheme";

import { LibraryCard } from "../../components/library/LibraryCard";
import {
  SkeletonCardGrid,
  SkeletonRow,
} from "../../components/ui/SkeletonLoader";
import { hapticSelection, hapticSuccess } from "../../lib/haptics";
import { FilterChipBar } from "../../components/ui/FilterChipBar";
import { useToastStore } from "../../stores/toastStore";

export default function LibraryScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { data: items, isLoading } = useLibrary();
  const removeFromLibrary = useRemoveFromLibrary();
  const addToLibrary = useAddToLibrary();
  const bulkRemoveFromLibrary = useRemoveBulkFromLibrary();
  const { t } = useTranslation();
  const tasks = useDownloadStore((s) => s.tasks);
  const [refreshing, setRefreshing] = useState(false);
  const numColumns = useResponsiveColumns();
  const [activeFilter, setActiveFilter] = useState<
    "all" | "movie" | "series" | "offline"
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
          <Text style={{ color: colors.tint, fontSize: 16, fontWeight: "600" }}>
            {isSelectionMode
              ? t("library.header.cancel")
              : t("library.header.select")}
          </Text>
        </Pressable>
      ),
    });
  }, [navigation, isSelectionMode, isAuthenticated]);

  const handleRemove = useCallback(
    (itemId: string, isDownload?: boolean) => {
      const removedItem = items?.find((item) => item.itemId === itemId);
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
      if (removedItem && !isDownload) {
        useToastStore.getState().show("Removed from Library", "info", {
          actionLabel: "Undo",
          onAction: () =>
            addToLibrary.mutateAsync({
              type: removedItem.type,
              itemId: removedItem.itemId,
              title: removedItem.title,
              poster: removedItem.poster ?? undefined,
            }),
        });
      }
      hapticSuccess();
    },
    [addToLibrary, items, removeFromLibrary, tasks],
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
      t("library.alerts.bulkDeleteTitle"),
      t("library.alerts.bulkDeleteMessage", { count: selectedIds.size }),
      [
        { text: t("library.header.cancel"), style: "cancel" },
        {
          text: t("library.fab.delete"),
          style: "destructive",
          onPress: () => {
            const idsArray = Array.from(selectedIds);
            const removedItems =
              items?.filter((item) => selectedIds.has(item.itemId)) ?? [];

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
                if (removedItems.length > 0) {
                  useToastStore
                    .getState()
                    .show(
                      `${removedItems.length} ${removedItems.length === 1 ? "title" : "titles"} removed from Library`,
                      "info",
                      {
                        actionLabel: "Restore",
                        onAction: () =>
                          Promise.all(
                            removedItems.map((item) =>
                              addToLibrary.mutateAsync({
                                type: item.type,
                                itemId: item.itemId,
                                title: item.title,
                                poster: item.poster ?? undefined,
                              }),
                            ),
                          ),
                      },
                    );
                }
              },
            });
          },
        },
      ],
    );
  }, [addToLibrary, bulkRemoveFromLibrary, items, selectedIds, t, tasks]);

  const filteredItems = useMemo(() => {
    if (activeFilter === "offline") {
      // Map download tasks to a similar structure as LibraryItem
      return Object.values(tasks)
        .filter(isTaskOfflinePlayable)
        .map((t) => ({
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
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          size="large"
          icon="bookmarks-outline"
          title={t("library.auth.title")}
          description={t("library.auth.subtitle")}
          actionLabel={t("library.auth.button")}
          onAction={() => router.push("/login")}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <SkeletonRow />
        </View>
        <SkeletonCardGrid count={9} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            <FilterChipBar
              options={[
                { label: t("library.filters.all"), value: "all" },
                { label: t("library.filters.movies"), value: "movie" },
                { label: t("library.filters.series"), value: "series" },
                { label: t("library.filters.offline"), value: "offline" },
              ]}
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as typeof activeFilter)}
              containerStyle={{ marginTop: 12, marginBottom: 4 }}
            />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="bookmarks-outline"
            title={t("library.empty.title")}
            description={
              activeFilter === "all"
                ? t("library.empty.description")
                : activeFilter === "movie"
                  ? t("library.empty.noMovies")
                  : t("library.empty.noSeries")
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
            tintColor={colors.tint}
            colors={[colors.tint]}
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
        <View
          style={[styles.floatingActionBar, { backgroundColor: colors.error }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.fabText, { color: colors.onTint }]}>
            {t("library.fab.selected", { count: selectedIds.size })}
          </Text>
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
              color={selectedIds.size === 0 ? colors.disabled : colors.onTint}
            />
            <Text
              style={[
                styles.fabButtonText,
                { color: colors.onTint },
                selectedIds.size === 0 && styles.fabButtonTextDisabled,
                selectedIds.size === 0 && { color: colors.disabled },
              ]}
            >
              {t("library.fab.delete")}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
  },
  columnWrapper: { paddingHorizontal: 12, gap: 10, marginBottom: 10 },
  listContent: { paddingBottom: 24 },
  floatingActionBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 24 : 16,
    left: 16,
    right: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 4px 8px rgba(239, 68, 68, 0.3)" }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        }),
    elevation: 8,
  } as any,
  fabText: {
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
    fontWeight: "700",
    fontSize: 14,
  },
  fabButtonTextDisabled: {},
});
