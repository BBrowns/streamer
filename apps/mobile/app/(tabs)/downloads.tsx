import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadQueueCard } from "../../components/downloads/DownloadQueueCard";
import {
  SmartDownloadPlans,
  SmartDownloadsStatusRow,
} from "../../components/downloads/SmartDownloadsStatus";
import {
  formatBytes,
  getDownloadQueueGroup,
  getDownloadQueueSummary,
  sortDownloadTasks,
  type DownloadQueueGroup,
} from "../../components/downloads/downloadPresentation";
import { EmptyState } from "../../components/ui/EmptyState";
import { FilterChipBar } from "../../components/ui/FilterChipBar";
import { AppButton } from "../../components/ui/AppButton";
import { Surface } from "../../components/ui/Surface";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { hapticImpactLight } from "../../lib/haptics";
import {
  isTaskOfflinePlayable,
  type DownloadTask,
  useDownloadStore,
} from "../../stores/downloadStore";
import { usePlayerStore } from "../../stores/playerStore";
import {
  downloadService,
  type DownloadOperationResult,
} from "../../services/DownloadService";
import { useToastStore } from "../../stores/toastStore";
import { SelectionActionBar } from "../../components/ui/SelectionActionBar";
import {
  DESTRUCTIVE_UNDO_MS,
  scheduleUndoableAction,
} from "../../services/undoableAction";
import {
  uiLayout,
  uiSpacing,
  uiTypography,
} from "../../components/ui/designSystem";

type QueueFilter = "all" | DownloadQueueGroup;

interface DownloadSection {
  key: DownloadQueueGroup;
  title: string;
  subtitle: string;
  data: DownloadTask[];
}

export default function DownloadsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isCompact: compact } = useWindowClass();
  const tasksDict = useDownloadStore((state) => state.tasks);
  const tasks = useMemo(
    () => sortDownloadTasks(Object.values(tasksDict)),
    [tasksDict],
  );
  const summary = useMemo(() => getDownloadQueueSummary(tasks), [tasks]);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const refreshQueue = useCallback(async () => {
    setRefreshing(true);
    try {
      await downloadService.refreshQueue();
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  const runTaskOperation = useCallback(
    async (id: string, operation: () => Promise<DownloadOperationResult>) => {
      hapticImpactLight();
      setBusyIds((current) => new Set(current).add(id));
      try {
        return await operation();
      } finally {
        setBusyIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [],
  );

  const openTask = useCallback(
    async (task: DownloadTask) => {
      hapticImpactLight();
      if (
        isTaskOfflinePlayable(task) &&
        task.localUri &&
        (await downloadService.verifyTask(task.id))
      ) {
        usePlayerStore
          .getState()
          .setStream({ ...task.mediaInfo, url: task.localUri }, task.mediaInfo);
        router.push("/player");
        return;
      }

      if (task.mediaInfo.itemId) {
        router.push(
          `/detail/${task.mediaInfo.type}/${task.mediaInfo.itemId}` as any,
        );
      }
    },
    [router],
  );

  const confirmDelete = useCallback(
    (task: DownloadTask) => {
      const title =
        task.mediaInfo.title ||
        t("downloads.unknownTitle", { defaultValue: "Download" });
      const deleteTask = () => {
        const action = scheduleUndoableAction({
          key: `download:${task.id}`,
          commit: async () => {
            const result = await runTaskOperation(task.id, () =>
              downloadService.deleteDownload(task.id),
            );
            if (!result.ok) {
              throw new Error(result.error || "Download could not be deleted.");
            }
          },
          onError: () =>
            useToastStore.getState().show(
              t("downloads.alerts.deleteFailed", {
                defaultValue: "Could not delete this download.",
              }),
              "error",
            ),
        });
        useToastStore.getState().show(
          t("downloads.alerts.deleting", {
            title,
            defaultValue: `Deleting “${title}”…`,
          }),
          "info",
          {
            actionLabel: t("library.actions.undo", { defaultValue: "Undo" }),
            duration: DESTRUCTIVE_UNDO_MS,
            onAction: () => {
              action.undo();
            },
          },
        );
      };

      if (Platform.OS === "web") {
        if (
          window.confirm(
            t("downloads.alerts.deleteMessage", {
              defaultValue: `Delete "${title}" from this device?`,
              title,
            }),
          )
        ) {
          deleteTask();
        }
        return;
      }

      Alert.alert(
        t("downloads.alerts.deleteTitle", { defaultValue: "Delete download?" }),
        t("downloads.alerts.deleteMessage", {
          defaultValue: `Delete "${title}" from this device?`,
          title,
        }),
        [
          {
            text: t("common.cancel", { defaultValue: "Cancel" }),
            style: "cancel",
          },
          {
            text: t("downloads.actions.delete", { defaultValue: "Delete" }),
            style: "destructive",
            onPress: deleteTask,
          },
        ],
      );
    },
    [runTaskOperation, t],
  );

  const manageStorage = useCallback(() => {
    if (summary.ready > 0) {
      setFilter("ready");
      return;
    }

    const message = t("downloads.storage.externalCleanup", {
      defaultValue:
        "There are no verified offline titles to remove here. Free device storage, then retry the download.",
    });
    if (Platform.OS === "web") window.alert(message);
    else
      Alert.alert(
        t("downloads.storage.freeTitle", {
          defaultValue: "Free device storage",
        }),
        message,
      );
  }, [summary.ready, t]);

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (task) => filter === "all" || getDownloadQueueGroup(task) === filter,
      ),
    [filter, tasks],
  );
  const canSelect = visibleTasks.length > 0;
  const toggleSelectionMode = useCallback(() => {
    if (!canSelect && !isSelectionMode) return;
    hapticImpactLight();
    setIsSelectionMode((current) => !current);
    setSelectedIds(new Set());
  }, [canSelect, isSelectionMode]);

  useEffect(() => {
    const visibleIds = new Set(visibleTasks.map((task) => task.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
    if (!canSelect) setIsSelectionMode(false);
  }, [canSelect, visibleTasks]);

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, [filter]);

  const toggleTaskSelection = useCallback((id: string) => {
    hapticImpactLight();
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const scheduleBulkDelete = useCallback(() => {
    const ids = [...selectedIds].sort();
    if (ids.length === 0) return;
    const action = scheduleUndoableAction({
      key: `downloads:bulk:${ids.join(",")}`,
      commit: async () => {
        const results = await Promise.all(
          ids.map((id) => downloadService.deleteDownload(id)),
        );
        if (results.some((result) => !result.ok)) {
          throw new Error("One or more downloads could not be deleted.");
        }
      },
      onError: () =>
        useToastStore.getState().show(
          t("downloads.alerts.bulkDeleteFailed", {
            defaultValue: "Some downloads could not be deleted.",
          }),
          "error",
        ),
    });
    setIsSelectionMode(false);
    setSelectedIds(new Set());
    useToastStore.getState().show(
      t("downloads.alerts.bulkDeleting", {
        count: ids.length,
        defaultValue: `Deleting ${ids.length} downloads…`,
      }),
      "info",
      {
        actionLabel: t("library.actions.undo", { defaultValue: "Undo" }),
        duration: DESTRUCTIVE_UNDO_MS,
        onAction: () => {
          action.undo();
        },
      },
    );
  }, [selectedIds, t]);

  const confirmBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const title = t("downloads.alerts.bulkDeleteTitle", {
      defaultValue: "Delete selected downloads?",
    });
    const message = t("downloads.alerts.bulkDeleteMessage", {
      count: selectedIds.size,
      defaultValue: `Delete ${selectedIds.size} downloads from this device? You can undo for a few seconds.`,
    });
    if (Platform.OS === "web") {
      if (window.confirm(message)) scheduleBulkDelete();
      return;
    }
    Alert.alert(title, message, [
      { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
      {
        text: t("downloads.actions.delete", { defaultValue: "Delete" }),
        style: "destructive",
        onPress: scheduleBulkDelete,
      },
    ]);
  }, [scheduleBulkDelete, selectedIds.size, t]);

  const sections = useMemo<DownloadSection[]>(() => {
    const groups: Record<DownloadQueueGroup, DownloadTask[]> = {
      active: [],
      attention: [],
      ready: [],
    };
    for (const task of visibleTasks)
      groups[getDownloadQueueGroup(task)].push(task);

    const definitions: DownloadSection[] = [
      {
        key: "active",
        title: t("downloads.sections.active", {
          defaultValue: "Active queue",
        }),
        subtitle: t("downloads.sections.activeSubtitle", {
          defaultValue: "Preparing, downloading, and paused items",
        }),
        data: groups.active,
      },
      {
        key: "attention",
        title: t("downloads.sections.attention", {
          defaultValue: "Needs attention",
        }),
        subtitle: t("downloads.sections.attentionSubtitle", {
          defaultValue: "Retry or remove failed downloads",
        }),
        data: groups.attention,
      },
      {
        key: "ready",
        title: t("downloads.sections.ready", {
          defaultValue: "Ready offline",
        }),
        subtitle: t("downloads.sections.readySubtitle", {
          defaultValue: "Verified files available on this device",
        }),
        data: groups.ready,
      },
    ];

    return definitions.filter((section) => section.data.length > 0);
  }, [t, visibleTasks]);

  const readySize = formatBytes(summary.readyBytes);
  const filterOptions = [
    {
      label: t("downloads.filters.all", {
        defaultValue: `All ${tasks.length}`,
        count: tasks.length,
      }),
      value: "all" as const,
    },
    {
      label: t("downloads.filters.active", {
        defaultValue: `Active ${summary.active}`,
        count: summary.active,
      }),
      value: "active" as const,
    },
    {
      label: t("downloads.filters.ready", {
        defaultValue: `Ready ${summary.ready}`,
        count: summary.ready,
      }),
      value: "ready" as const,
    },
    {
      label: t("downloads.filters.attention", {
        defaultValue: `Issues ${summary.attention}`,
        count: summary.attention,
      }),
      value: "attention" as const,
    },
  ];

  if (tasks.length === 0 && !refreshing) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.emptyContent,
          compact && styles.emptyContentCompact,
        ]}
      >
        <View style={styles.emptyHero}>
          <EmptyState
            testID="downloads-empty-state"
            fill={false}
            size="medium"
            icon="cloud-download-outline"
            title={t("downloads.empty.title", { defaultValue: "No downloads" })}
            description={t("downloads.empty.description", {
              defaultValue:
                "Movies and shows you save for offline viewing will appear here.",
            })}
            actionLabel={t("downloads.empty.action", {
              defaultValue: "Browse movies and shows",
            })}
            onAction={() => router.push("/search")}
          />
        </View>
        <View style={styles.emptySmartStatus}>
          <SmartDownloadsStatusRow
            onPress={() => router.push("/settings/downloads" as never)}
          />
          <SmartDownloadPlans />
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshQueue}
            tintColor={colors.tint}
            colors={[colors.tint]}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View
              style={[
                styles.headerTitleRow,
                compact && styles.headerTitleRowCompact,
              ]}
            >
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {t("downloads.title", { defaultValue: "Downloads" })}
                </Text>
                <Text
                  style={[styles.subtitle, { color: colors.textSecondary }]}
                >
                  {t("downloads.header.subtitle", {
                    defaultValue:
                      "Your queue and verified offline files on this device",
                  })}
                </Text>
              </View>
              {canSelect || isSelectionMode ? (
                <AppButton
                  label={
                    isSelectionMode
                      ? t("library.header.cancel", { defaultValue: "Cancel" })
                      : t("library.header.select", { defaultValue: "Select" })
                  }
                  variant="secondary"
                  size="small"
                  onPress={toggleSelectionMode}
                  style={compact ? styles.clearButtonCompact : undefined}
                />
              ) : null}
            </View>

            <View style={styles.summaryRow}>
              <SummaryItem
                label={t("downloads.summary.active", {
                  defaultValue: "Active",
                })}
                value={String(summary.active)}
                color={colors.tint}
              />
              <SummaryItem
                label={t("downloads.summary.ready", {
                  defaultValue: "Ready",
                })}
                value={String(summary.ready)}
                color={colors.success}
              />
              <SummaryItem
                label={t("downloads.summary.needsVerification", {
                  defaultValue: "Needs check",
                })}
                value={String(summary.needsVerification)}
                color={colors.warning}
              />
              <SummaryItem
                label={t("downloads.summary.storage", {
                  defaultValue: "Verified storage",
                })}
                value={readySize || "—"}
                color={colors.warning}
              />
            </View>

            <FilterChipBar
              options={filterOptions}
              value={filter}
              onChange={setFilter}
              containerStyle={styles.filters}
              accessibilityLabel={t("downloads.filters.label", {
                defaultValue: "Filter downloads",
              })}
            />

            <View style={styles.smartDownloadsPanel}>
              <SmartDownloadsStatusRow
                onPress={() => router.push("/settings/downloads" as never)}
              />
              <SmartDownloadPlans />
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {section.title}
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              {section.subtitle}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <DownloadQueueCard
            task={item}
            busy={busyIds.has(item.id)}
            onOpen={() => void openTask(item)}
            onPause={() =>
              void runTaskOperation(item.id, () =>
                downloadService.pauseDownload(item.id),
              )
            }
            onResume={() =>
              void runTaskOperation(item.id, () =>
                downloadService.resumeDownload(item.id),
              )
            }
            onRetry={() =>
              void runTaskOperation(item.id, () =>
                downloadService.resumeDownload(item.id),
              )
            }
            onVerify={() =>
              void runTaskOperation(item.id, async () => {
                const verified = await downloadService.verifyTask(item.id);
                return {
                  ok: verified,
                  error: verified
                    ? undefined
                    : "Downloaded file could not be verified.",
                };
              })
            }
            onRepairBridge={() => router.push("/settings/sources" as any)}
            onManageStorage={manageStorage}
            onDelete={() => confirmDelete(item)}
            isSelectionMode={isSelectionMode}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={() => toggleTaskSelection(item.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        SectionSeparatorComponent={() => (
          <View style={styles.sectionSeparator} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="filter-outline"
            title={t("downloads.empty.filterTitle", {
              defaultValue: "Nothing in this view",
            })}
            description={t("downloads.empty.filterDescription", {
              defaultValue:
                "Choose another filter to see the rest of the queue.",
            })}
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              {t("downloads.footer.verified", {
                defaultValue:
                  "Offline items are shown as ready only after the local file is verified.",
              })}
            </Text>
          </View>
        }
      />
      <SelectionActionBar
        selectedCount={isSelectionMode ? selectedIds.size : 0}
        selectedLabel={t("downloads.selection.selected", {
          count: selectedIds.size,
          defaultValue: `${selectedIds.size} selected`,
        })}
        actionLabel={t("downloads.actions.delete", { defaultValue: "Delete" })}
        actionAccessibilityLabel={t("downloads.selection.deleteSelected", {
          defaultValue: "Delete selected downloads",
        })}
        onAction={confirmBulkDelete}
      />
    </View>
  );
}

function SummaryItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const { colors } = useTheme();
  return (
    <Surface variant="plain" padded={false} style={styles.summaryItem}>
      <View style={[styles.summaryMarker, { backgroundColor: color }]} />
      <View>
        <Text style={[styles.summaryValue, { color: colors.text }]}>
          {value}
        </Text>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    width: "100%",
    maxWidth: uiLayout.detailMaxWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 44,
  },
  header: {
    marginBottom: 18,
  },
  emptyContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
    justifyContent: "flex-start",
    gap: 32,
    paddingHorizontal: 18,
    paddingTop: 56,
    paddingBottom: 88,
  },
  emptyContentCompact: {
    gap: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  emptyHero: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  emptySmartStatus: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  headerTitleRowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  clearButtonCompact: {
    alignSelf: "flex-start",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...uiTypography.headline,
  },
  subtitle: {
    marginTop: 5,
    ...uiTypography.body,
  },
  summaryRow: {
    marginTop: uiSpacing.xxl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryItem: {
    minWidth: 132,
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 54,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryMarker: {
    width: 4,
    height: 30,
    borderRadius: 2,
  },
  summaryValue: {
    ...uiTypography.title,
    fontSize: 18,
    lineHeight: 22,
  },
  summaryLabel: {
    marginTop: 2,
    ...uiTypography.caption,
  },
  filters: {
    marginTop: 15,
    marginBottom: 0,
    marginHorizontal: -16,
  },
  smartDownloadsPanel: {
    marginTop: 16,
  },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    ...uiTypography.title,
    fontSize: 20,
    lineHeight: 26,
  },
  sectionSubtitle: {
    marginTop: 2,
    ...uiTypography.caption,
  },
  itemSeparator: {
    height: 12,
  },
  sectionSeparator: {
    height: 18,
  },
  footer: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 2,
  },
  footerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    letterSpacing: 0,
  },
});
