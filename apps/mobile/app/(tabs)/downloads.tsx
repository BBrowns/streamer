import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
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
  formatBytes,
  getDownloadQueueGroup,
  getDownloadQueueSummary,
  sortDownloadTasks,
  type DownloadQueueGroup,
} from "../../components/downloads/downloadPresentation";
import { EmptyState } from "../../components/ui/EmptyState";
import { FilterChipBar } from "../../components/ui/FilterChipBar";
import { useTheme } from "../../hooks/useTheme";
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
  const { colors, isDark } = useTheme();
  const tasksDict = useDownloadStore((state) => state.tasks);
  const tasks = useMemo(
    () => sortDownloadTasks(Object.values(tasksDict)),
    [tasksDict],
  );
  const summary = useMemo(() => getDownloadQueueSummary(tasks), [tasks]);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

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
        await operation();
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
      const deleteTask = () =>
        void runTaskOperation(task.id, () =>
          downloadService.deleteDownload(task.id),
        );

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

  const deleteAll = useCallback(async () => {
    setDeletingAll(true);
    try {
      await downloadService.deleteAllDownloads();
    } finally {
      setDeletingAll(false);
    }
  }, []);

  const confirmClearAll = useCallback(() => {
    if (Platform.OS === "web") {
      if (
        window.confirm(
          t("downloads.alerts.clearAllConfirm", {
            defaultValue:
              "Delete every managed download and remove its local file?",
          }),
        )
      ) {
        void deleteAll();
      }
      return;
    }

    Alert.alert(
      t("downloads.alerts.clearAllTitle", {
        defaultValue: "Delete all downloads?",
      }),
      t("downloads.alerts.clearAllMessage", {
        defaultValue:
          "This removes every managed download and its local file from this device.",
      }),
      [
        {
          text: t("common.cancel", { defaultValue: "Cancel" }),
          style: "cancel",
        },
        {
          text: t("downloads.alerts.clearAllButton", {
            defaultValue: "Delete all",
          }),
          style: "destructive",
          onPress: () => void deleteAll(),
        },
      ],
    );
  }, [deleteAll, t]);

  const sections = useMemo<DownloadSection[]>(() => {
    const groups: Record<DownloadQueueGroup, DownloadTask[]> = {
      active: [],
      attention: [],
      ready: [],
    };
    for (const task of tasks) groups[getDownloadQueueGroup(task)].push(task);

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

    return definitions.filter(
      (section) =>
        section.data.length > 0 && (filter === "all" || filter === section.key),
    );
  }, [filter, t, tasks]);

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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          size="large"
          icon="cloud-download-outline"
          title={t("downloads.empty.title", { defaultValue: "No downloads" })}
          description={t("downloads.empty.description", {
            defaultValue:
              "Movies and shows you save for offline viewing will appear here.",
          })}
          actionLabel={t("downloads.empty.action", {
            defaultValue: "Browse movies and shows",
          })}
          onAction={() => router.push("/discover")}
        />
      </View>
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
            <View style={styles.headerTitleRow}>
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
              <Pressable
                style={({ pressed }) => [
                  styles.clearButton,
                  {
                    backgroundColor: colors.error + (isDark ? "16" : "10"),
                  },
                  pressed && styles.pressed,
                ]}
                onPress={confirmClearAll}
                disabled={deletingAll}
                accessibilityRole="button"
                accessibilityLabel={t("downloads.actions.clearAll", {
                  defaultValue: "Delete all downloads",
                })}
              >
                <Ionicons name="trash-outline" size={17} color={colors.error} />
                <Text style={[styles.clearButtonText, { color: colors.error }]}>
                  {t("downloads.actions.clearAll", {
                    defaultValue: "Delete all",
                  })}
                </Text>
              </Pressable>
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
                label={t("downloads.summary.storage", {
                  defaultValue: "Offline storage",
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
            />
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
            onDelete={() => confirmDelete(item)}
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
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.summaryItem,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.055)"
            : "rgba(255,255,255,0.58)",
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[styles.summaryMarker, { backgroundColor: color }]} />
      <View>
        <Text style={[styles.summaryValue, { color: colors.text }]}>
          {value}
        </Text>
        <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    width: "100%",
    maxWidth: 1040,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 44,
  },
  header: {
    marginBottom: 18,
  },
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: 0,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0,
  },
  clearButton: {
    minHeight: 38,
    borderRadius: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
  summaryRow: {
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryItem: {
    minWidth: 132,
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 8,
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
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "900",
    letterSpacing: 0,
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0,
  },
  filters: {
    marginTop: 15,
    marginBottom: 0,
    marginHorizontal: -16,
  },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    letterSpacing: 0,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    letterSpacing: 0,
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
  pressed: {
    opacity: 0.72,
  },
});
