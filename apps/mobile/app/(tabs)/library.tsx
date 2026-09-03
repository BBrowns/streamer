import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useNavigation, useLocalSearchParams } from "expo-router";
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
import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, useEffect } from "react";
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
  resolveLibraryView,
  type LibraryFilter,
} from "../../components/library/libraryPresentation";
import type { WatchProgress } from "@streamer/shared";
import { SelectionActionBar } from "../../components/ui/SelectionActionBar";
import { RouteAccessibilityBoundary } from "../../components/ui/RouteAccessibilityBoundary";
import {
  DESTRUCTIVE_UNDO_MS,
  scheduleUndoableAction,
} from "../../services/undoableAction";

export default function LibraryScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const navigation = useNavigation();
  const { view } = useLocalSearchParams<{ view?: string | string[] }>();
  const requestedView = resolveLibraryView(view);
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
  const [refreshing, setRefreshing] = useState(false);
  const { isCompact, windowClass, width } = useWindowClass();
  const [gridContainerWidth, setGridContainerWidth] = useState(width);
  const [activeFilter, setActiveFilter] =
    useState<LibraryFilter>(requestedView);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const gridItems = useMemo(
    () => buildLibraryGridItems(items, activeFilter, historyItems),
    [activeFilter, historyItems, items],
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

  const navigateToHistory = useCallback(() => {
    router.push({ pathname: "/library", params: { view: "history" } } as never);
  }, [router]);

  const navigateToCollection = useCallback(() => {
    router.push("/library" as never);
  }, [router]);

  useEffect(() => {
    setActiveFilter(requestedView);
  }, [requestedView]);

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
        accessibilityLabel={t("library.history.clearAction", {
          defaultValue: "Clear",
        })}
        variant="danger"
        size="small"
        loading={clearWatchHistory.isPending}
        onPress={handleClearHistory}
      />
    ) : undefined
  ) : canSelect || isSelectionMode ? (
    <AppButton
      label={selectionActionLabel}
      accessibilityLabel={selectionActionLabel}
      variant="secondary"
      onPress={toggleSelectionMode}
    />
  ) : undefined;

  const historyNavigation = isHistoryView ? (
    <AppButton
      testID="library-collection-action"
      label={t("library.actions.backToCollection", {
        defaultValue: "Back to Library",
      })}
      variant="ghost"
      size="small"
      icon="chevron-back"
      onPress={navigateToCollection}
    />
  ) : (
    <AppButton
      testID="library-history-action"
      label={t("library.actions.history", { defaultValue: "History" })}
      variant="ghost"
      size="small"
      icon="time-outline"
      onPress={navigateToHistory}
    />
  );

  const headerActions = (
    <View style={styles.headerActions}>
      {historyNavigation}
      {headerAction}
    </View>
  );

  const pageTitle = isHistoryView
    ? t("library.history.title", { defaultValue: "Watch History" })
    : t("tabs.library");
  const pageDescription = isHistoryView
    ? t("library.history.description", {
        defaultValue: "Recently watched titles and playback progress.",
      })
    : t("library.header.description", {
        defaultValue: "Your saved films and series in one place.",
      });

  // Setup header button
  useEffect(() => {
    if (!isAuthenticated) return;
    navigation.setOptions({
      title: pageTitle,
      headerRight: () =>
        !isCompact && headerAction ? (
          <View style={styles.headerAction}>{headerAction}</View>
        ) : null,
    });
  }, [headerAction, isAuthenticated, isCompact, navigation, pageTitle]);

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
      <RouteAccessibilityBoundary>
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
      </RouteAccessibilityBoundary>
    );
  }

  if (isLoading) {
    return (
      <RouteAccessibilityBoundary>
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
      </RouteAccessibilityBoundary>
    );
  }

  return (
    <RouteAccessibilityBoundary>
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
            { maxWidth: uiLayout.pageWidths.catalog },
          ]}
          ListHeaderComponent={
            <>
              {!isCompact ? (
                <PageHeader
                  title={pageTitle}
                  description={pageDescription}
                  actions={headerActions}
                  style={styles.pageHeader}
                />
              ) : null}
              {!isHistoryView ? (
                <ContentTabs
                  options={[
                    { label: t("library.filters.all"), value: "all" },
                    { label: t("library.filters.movies"), value: "movie" },
                    { label: t("library.filters.series"), value: "series" },
                  ]}
                  value={activeFilter}
                  onChange={(v) => setActiveFilter(v as typeof activeFilter)}
                  style={styles.libraryTabs}
                  accessibilityLabel={t("tabs.library")}
                />
              ) : null}
              {isCompact ? (
                <View style={styles.compactActions}>{headerActions}</View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            isHistoryView && isHistoryLoading ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator color={colors.textSecondary} />
              </View>
            ) : (
              <EmptyState
                icon={
                  activeFilter === "history"
                    ? "time-outline"
                    : "bookmarks-outline"
                }
                title={
                  activeFilter === "history"
                    ? t("library.history.emptyTitle", {
                        defaultValue: "No watch history yet",
                      })
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
                          : t("library.empty.description")
                }
              />
            )
          }
          ListFooterComponent={
            isHistoryView && (isHistoryLoading || isFetchingMoreHistory) ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator color={colors.textSecondary} />
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
              tintColor={colors.textSecondary}
              colors={[colors.textSecondary]}
            />
          }
          renderItem={({ item }) => (
            <LibraryCard
              item={item.item}
              selectionKey={item.selectionKey}
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
    </RouteAccessibilityBoundary>
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: uiSpacing.sm,
  },
  libraryTabs: {
    marginTop: uiSpacing.md,
    marginBottom: uiSpacing.xs,
    marginHorizontal: uiSpacing.lg,
  },
  compactActions: {
    marginHorizontal: uiSpacing.lg,
    marginTop: uiSpacing.sm,
    marginBottom: uiSpacing.lg,
  },
  headerAction: {
    marginRight: uiSpacing.sm,
  },
  historyLoading: {
    alignItems: "center",
    paddingVertical: uiSpacing.xl,
  },
});
