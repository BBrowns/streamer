import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { useAuthStore } from "../../stores/authStore";
import { useTranslation } from "react-i18next";
import {
  useLibrary,
  useRemoveFromLibrary,
  useRemoveBulkFromLibrary,
} from "../../hooks/useLibrary";
import {
  useClearWatchHistory,
  useRemoveWatchHistoryEntry,
  useWatchHistory,
} from "../../hooks/useWatchHistory";
import { ContinueWatchingRow } from "../../components/catalog/ContinueWatchingRow";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useDownloadStore } from "../../stores/downloadStore";
import { EmptyState } from "../../components/ui/EmptyState";
import { useTheme } from "../../hooks/useTheme";

import { LibraryCard } from "../../components/library/LibraryCard";
import {
  SkeletonCardGrid,
  SkeletonRow,
} from "../../components/ui/SkeletonLoader";
import { hapticSelection, hapticSuccess } from "../../lib/haptics";
import { ContentTabs } from "../../components/ui/ContentTabs";
import { useToastStore } from "../../stores/toastStore";
import { PageHeader } from "../../components/ui/PageHeader";
import { AppButton } from "../../components/ui/AppButton";
import { useWindowClass } from "../../hooks/useWindowClass";
import { uiLayout, uiSpacing } from "../../components/ui/designSystem";
import {
  buildLibraryGridItems,
  canStartLibrarySelection,
  getLibraryGridMetrics,
  type LibraryFilter,
} from "../../components/library/libraryPresentation";
import type { WatchProgress } from "@streamer/shared";
import { SelectionActionBar } from "../../components/ui/SelectionActionBar";
import {
  DESTRUCTIVE_UNDO_MS,
  scheduleUndoableAction,
} from "../../services/undoableAction";

export default function LibraryScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { data: items, isLoading } = useLibrary();
  const {
    items: historyItems,
    isLoading: isHistoryLoading,
    isFetchingNextPage: isFetchingMoreHistory,
    hasNextPage: hasMoreHistory,
    fetchNextPage: fetchMoreHistory,
  } = useWatchHistory();
  const removeFromLibrary = useRemoveFromLibrary();
  const bulkRemoveFromLibrary = useRemoveBulkFromLibrary();
  const removeHistoryEntry = useRemoveWatchHistoryEntry();
  const clearWatchHistory = useClearWatchHistory();
  const { t } = useTranslation();
  const tasks = useDownloadStore((s) => s.tasks);
  const [refreshing, setRefreshing] = useState(false);
  const { isCompact, windowClass, width } = useWindowClass();
  const [gridContainerWidth, setGridContainerWidth] = useState(width);
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>("all");

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const gridItems = useMemo(
    () => buildLibraryGridItems(items, tasks, activeFilter, historyItems),
    [activeFilter, historyItems, items, tasks],
  );
  const gridMetrics = useMemo(
    () => getLibraryGridMetrics(gridContainerWidth, windowClass),
    [gridContainerWidth, windowClass],
  );
  const canSelect = canStartLibrarySelection(activeFilter, gridItems.length);
  const isHistoryView = activeFilter === "history";
  const selectionActionLabel = isSelectionMode
    ? t("library.header.cancel")
    : t("library.header.select");
  const toggleSelectionMode = useCallback(() => {
    if (!canSelect && !isSelectionMode) return;
    hapticSelection();
    setIsSelectionMode((current) => !current);
    setSelectedIds(new Set());
  }, [canSelect, isSelectionMode]);

  const handleRemoveHistoryEntry = useCallback(
    (historyId: string, title: string) => {
      Alert.alert(
        t("library.history.removeTitle", {
          defaultValue: "Remove from watch history?",
        }),
        t("library.history.removeMessage", {
          title,
          defaultValue: `Remove \"${title}\" from your watch history?`,
        }),
        [
          { text: t("library.header.cancel"), style: "cancel" },
          {
            text: t("library.history.removeAction", {
              defaultValue: "Remove",
            }),
            style: "destructive",
            onPress: () => {
              void removeHistoryEntry
                .mutateAsync(historyId)
                .then(() => {
                  hapticSuccess();
                  useToastStore.getState().show(
                    t("library.history.removed", {
                      defaultValue: "Removed from watch history.",
                    }),
                    "info",
                  );
                })
                .catch(() => {
                  useToastStore.getState().show(
                    t("library.history.removeFailed", {
                      defaultValue: "Could not remove this history entry.",
                    }),
                    "error",
                  );
                });
            },
          },
        ],
      );
    },
    [removeHistoryEntry, t],
  );

  const handleClearHistory = useCallback(() => {
    if (historyItems.length === 0 || clearWatchHistory.isPending) return;
    Alert.alert(
      t("library.history.clearTitle", {
        defaultValue: "Clear watch history?",
      }),
      t("library.history.clearMessage", {
        defaultValue:
          "This permanently removes all watched titles and progress from your history. Your Library and downloads stay untouched.",
      }),
      [
        { text: t("library.header.cancel"), style: "cancel" },
        {
          text: t("library.history.clearAction", { defaultValue: "Clear" }),
          style: "destructive",
          onPress: () => {
            void clearWatchHistory
              .mutateAsync()
              .then(() => {
                hapticSuccess();
                useToastStore.getState().show(
                  t("library.history.cleared", {
                    defaultValue: "Watch history cleared.",
                  }),
                  "info",
                );
              })
              .catch(() => {
                useToastStore.getState().show(
                  t("library.history.clearFailed", {
                    defaultValue: "Could not clear watch history.",
                  }),
                  "error",
                );
              });
          },
        },
      ],
    );
  }, [clearWatchHistory, historyItems.length, t]);

  const handleLoadMoreHistory = useCallback(() => {
    if (isHistoryView && hasMoreHistory && !isFetchingMoreHistory) {
      void fetchMoreHistory();
    }
  }, [fetchMoreHistory, hasMoreHistory, isFetchingMoreHistory, isHistoryView]);

  const getHistoryMetadata = useCallback(
    (entry: WatchProgress) => {
      const episode =
        entry.season != null && entry.episode != null
          ? `S${entry.season} E${entry.episode}`
          : null;
      const watchedAt = new Date(entry.lastWatched);
      const date = Number.isNaN(watchedAt.getTime())
        ? null
        : new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
          }).format(watchedAt);
      const lastWatched = date
        ? t("library.history.lastWatched", {
            date,
            defaultValue: `Watched ${date}`,
          })
        : null;
      return [episode, lastWatched].filter(Boolean).join(" · ") || undefined;
    },
    [t],
  );

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, [activeFilter]);

  useEffect(() => {
    const visibleIds = new Set(gridItems.map((item) => item.selectionKey));
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter((selectionKey) => visibleIds.has(selectionKey)),
      );
      return next.size === current.size ? current : next;
    });
    if (!canSelect) setIsSelectionMode(false);
  }, [canSelect, gridItems]);

  const headerAction = isHistoryView ? (
    historyItems.length > 0 ? (
      <AppButton
        label={t("library.history.clearAction", { defaultValue: "Clear" })}
        variant="danger"
        size="small"
        loading={clearWatchHistory.isPending}
        onPress={handleClearHistory}
      />
    ) : undefined
  ) : canSelect || isSelectionMode ? (
    <AppButton
      label={selectionActionLabel}
      variant="secondary"
      onPress={toggleSelectionMode}
    />
  ) : undefined;

  // Setup header button
  useEffect(() => {
    if (!isAuthenticated) return;
    navigation.setOptions({
      headerRight: () =>
        headerAction ? (
          <View style={styles.headerAction}>{headerAction}</View>
        ) : null,
    });
  }, [headerAction, isAuthenticated, navigation]);

  const handleRemove = useCallback(
    (itemId: string) => {
      const key = `library:${itemId}`;
      const action = scheduleUndoableAction({
        key,
        commit: () => removeFromLibrary.mutateAsync(itemId),
        onError: () =>
          useToastStore.getState().show(
            t("library.alerts.removeFailed", {
              defaultValue: "Could not remove this title.",
            }),
            "error",
          ),
      });
      useToastStore.getState().show(t("library.alerts.removed"), "info", {
        actionLabel: t("library.actions.undo"),
        duration: DESTRUCTIVE_UNDO_MS,
        onAction: () => {
          action.undo();
        },
      });
      hapticSuccess();
    },
    [removeFromLibrary, t],
  );

  const toggleSelect = useCallback((selectionKey: string) => {
    hapticSelection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(selectionKey)) {
        next.delete(selectionKey);
      } else {
        next.add(selectionKey);
      }
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      t("library.alerts.bulkDeleteTitle"),
      t("library.alerts.bulkRemoveWithUndoMessage", {
        count: selectedIds.size,
        defaultValue: `Remove ${selectedIds.size} titles from your Library? You can undo for a few seconds.`,
      }),
      [
        { text: t("library.header.cancel"), style: "cancel" },
        {
          text: t("library.fab.delete"),
          style: "destructive",
          onPress: () => {
            const itemIds = gridItems
              .filter((item) => selectedIds.has(item.selectionKey))
              .map((item) => item.item.itemId);
            const key = `library:bulk:${itemIds.sort().join(",")}`;
            const action = scheduleUndoableAction({
              key,
              commit: () => bulkRemoveFromLibrary.mutateAsync(itemIds),
              onError: () =>
                useToastStore.getState().show(
                  t("library.alerts.bulkRemoveFailed", {
                    defaultValue: "Could not remove the selected titles.",
                  }),
                  "error",
                ),
            });
            hapticSuccess();
            setIsSelectionMode(false);
            setSelectedIds(new Set());
            useToastStore
              .getState()
              .show(
                t("library.actions.bulkRemoved", { count: itemIds.length }),
                "info",
                {
                  actionLabel: t("library.actions.undo"),
                  duration: DESTRUCTIVE_UNDO_MS,
                  onAction: () => {
                    action.undo();
                  },
                },
              );
          },
        },
      ],
    );
  }, [bulkRemoveFromLibrary, gridItems, selectedIds, t]);

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
        key={gridMetrics.columns}
        data={gridItems}
        keyExtractor={(item) => item.key}
        numColumns={gridMetrics.columns}
        onLayout={(event) =>
          setGridContainerWidth(event.nativeEvent.layout.width)
        }
        columnWrapperStyle={{
          paddingHorizontal: gridMetrics.horizontalGutter,
          gap: gridMetrics.gap,
          marginBottom: uiSpacing.xl,
          justifyContent: "flex-start",
        }}
        contentContainerStyle={[
          styles.listContent,
          { maxWidth: uiLayout.contentMaxWidth },
        ]}
        ListHeaderComponent={
          <>
            {!isCompact ? (
              <PageHeader
                title={t("tabs.library")}
                description={t("library.header.description", {
                  defaultValue:
                    "Saved films, series, and everything ready to continue.",
                })}
                actions={headerAction}
                style={styles.pageHeader}
              />
            ) : null}
            {!isHistoryView ? <ContinueWatchingRow /> : null}
            <ContentTabs
              options={[
                { label: t("library.filters.all"), value: "all" },
                { label: t("library.filters.movies"), value: "movie" },
                { label: t("library.filters.series"), value: "series" },
                { label: t("library.filters.offline"), value: "offline" },
                {
                  label: t("library.filters.history", {
                    defaultValue: "History",
                  }),
                  value: "history",
                },
              ]}
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as typeof activeFilter)}
              style={styles.libraryTabs}
              accessibilityLabel={t("tabs.library")}
            />
            {activeFilter === "offline" ? (
              <View style={styles.offlineAction}>
                <AppButton
                  label={t("library.actions.manageDownloads", {
                    defaultValue: "Manage downloads",
                  })}
                  icon="cloud-download-outline"
                  variant="secondary"
                  size="small"
                  onPress={() => router.push("/downloads" as never)}
                />
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          isHistoryView && isHistoryLoading ? (
            <View style={styles.historyLoading}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : (
            <EmptyState
              icon={
                activeFilter === "history"
                  ? "time-outline"
                  : activeFilter === "offline"
                    ? "cloud-download-outline"
                    : "bookmarks-outline"
              }
              title={
                activeFilter === "history"
                  ? t("library.history.emptyTitle", {
                      defaultValue: "No watch history yet",
                    })
                  : activeFilter === "offline"
                    ? t("downloads.empty.title")
                    : t("library.empty.title")
              }
              description={
                activeFilter === "history"
                  ? t("library.history.emptyDescription", {
                      defaultValue:
                        "Titles you watch will appear here, including completed ones.",
                    })
                  : activeFilter === "all"
                    ? t("library.empty.description")
                    : activeFilter === "movie"
                      ? t("library.empty.noMovies")
                      : activeFilter === "series"
                        ? t("library.empty.noSeries")
                        : t("downloads.empty.description")
              }
            />
          )
        }
        ListFooterComponent={
          isHistoryView && (isHistoryLoading || isFetchingMoreHistory) ? (
            <View style={styles.historyLoading}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : null
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
            item={item.item}
            selectionKey={item.selectionKey}
            downloadTaskId={
              item.kind === "history" ? undefined : item.downloadTaskId
            }
            historyEntry={item.kind === "history" ? item.history : undefined}
            metadata={
              item.kind === "history"
                ? getHistoryMetadata(item.history)
                : undefined
            }
            onRemove={
              item.kind === "library"
                ? handleRemove
                : item.kind === "history"
                  ? (historyId) =>
                      handleRemoveHistoryEntry(historyId, item.item.title)
                  : undefined
            }
            removeId={item.kind === "history" ? item.history.id : undefined}
            removeLabel={
              item.kind === "history"
                ? t("library.history.removeAction", {
                    defaultValue: "Remove from history",
                  })
                : undefined
            }
            showRemoveButton={item.kind === "history"}
            isSelectionMode={isSelectionMode}
            isSelected={selectedIds.has(item.selectionKey)}
            onToggleSelect={toggleSelect}
            style={{ width: gridMetrics.cardWidth }}
          />
        )}
        onEndReached={handleLoadMoreHistory}
        onEndReachedThreshold={0.4}
      />

      <SelectionActionBar
        selectedCount={isSelectionMode ? selectedIds.size : 0}
        selectedLabel={t("library.fab.selected", { count: selectedIds.size })}
        actionLabel={t("library.fab.delete")}
        onAction={handleBulkDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
  },
  listContent: {
    width: "100%",
    alignSelf: "center",
    paddingBottom: uiSpacing.giant,
  },
  pageHeader: {
    paddingHorizontal: uiSpacing.lg,
    paddingTop: uiSpacing.xxxl,
  },
  libraryTabs: {
    marginTop: uiSpacing.md,
    marginBottom: uiSpacing.xs,
    marginHorizontal: uiSpacing.lg,
  },
  offlineAction: {
    marginHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.sm,
    marginBottom: uiSpacing.lg,
    alignItems: "flex-start",
  },
  headerAction: {
    marginRight: uiSpacing.sm,
  },
  historyLoading: {
    alignItems: "center",
    paddingVertical: uiSpacing.xl,
  },
});
