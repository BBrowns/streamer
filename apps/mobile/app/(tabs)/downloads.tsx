import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { useDownloadStore, DownloadTask } from "../../stores/downloadStore";
import { downloadService } from "../../services/DownloadService";
import { usePlayerStore } from "../../stores/playerStore";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/ui/EmptyState";
import { useTheme } from "../../hooks/useTheme";
import { useState } from "react";

function DownloadCard({ task }: { task: DownloadTask }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { mediaInfo, progress, status, id, error } = task;

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const title =
      mediaInfo.title ||
      t("downloads.unknownTitle", { defaultValue: "Unknown Download" });
    const deleteAction = () => downloadService.deleteDownload(id);

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t("common.cancel", { defaultValue: "Cancel" }),
            t("downloads.actions.viewDetails", {
              defaultValue: "View Details",
            }),
            t("downloads.actions.delete", { defaultValue: "Delete Download" }),
          ],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
          title,
          message: t("downloads.actions.manage", {
            defaultValue: "Manage your downloaded media",
          }),
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            if (mediaInfo.itemId)
              router.push(`/detail/${mediaInfo.type}/${mediaInfo.itemId}`);
          } else if (buttonIndex === 2) {
            deleteAction();
          }
        },
      );
    } else {
      Alert.alert(
        title,
        t("downloads.actions.manage", {
          defaultValue: "Manage your downloaded media",
        }),
        [
          {
            text: t("common.cancel", { defaultValue: "Cancel" }),
            style: "cancel",
          },
          {
            text: t("downloads.actions.viewDetails", {
              defaultValue: "View Details",
            }),
            onPress: () => {
              if (mediaInfo.itemId)
                router.push(`/detail/${mediaInfo.type}/${mediaInfo.itemId}`);
            },
          },
          {
            text: t("downloads.actions.delete", { defaultValue: "Delete" }),
            style: "destructive",
            onPress: deleteAction,
          },
        ],
      );
    }
  };

  const handlePress = async () => {
    if (status === "Completed" && task.localUri) {
      let fileExists = true;

      if (Platform.OS === "web") {
        const desktopBridge = (window as any).desktopBridge;
        if (desktopBridge) {
          try {
            fileExists = await desktopBridge.checkFile(task.localUri);
          } catch (e) {}
        }
      } else {
        try {
          const info = await FileSystem.getInfoAsync(task.localUri);
          fileExists = info.exists;
        } catch (e) {
          // Ignore and let player fail if there's a problem
        }
      }

      if (!fileExists) {
        Alert.alert(
          t("downloads.alerts.errorTitle", { defaultValue: "File Missing" }),
          t("downloads.alerts.errorMessage", {
            defaultValue: "The downloaded file could not be found.",
          }),
        );
        useDownloadStore.getState().verifyAndClean();
        return;
      }
      const { setStream } = usePlayerStore.getState();
      setStream({ ...mediaInfo, url: task.localUri }, mediaInfo);
      router.push("/player");
    } else if (mediaInfo.itemId) {
      router.push(`/detail/${mediaInfo.type}/${mediaInfo.itemId}`);
    }
  };

  const handleActionablePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (status === "Downloading") {
      downloadService.pauseDownload(id);
    } else if (status === "Paused") {
      downloadService.resumeDownload(id);
    } else if (status === "Completed") {
      handlePress();
    } else if (status === "Error") {
      downloadService.resumeDownload(id);
    }
  };

  const progressPercent = (progress * 100).toFixed(0) + "%";

  const statusColor =
    status === "Completed"
      ? "#4ade80"
      : status === "Error"
        ? (colors.error ?? "#ef4444")
        : colors.textSecondary;

  return (
    <Pressable
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <Image
        source={{ uri: mediaInfo.poster ?? undefined }}
        style={styles.cardImage}
      />
      <View style={styles.cardInfo}>
        <Text
          style={[styles.cardTitle, { color: colors.text }]}
          numberOfLines={2}
        >
          {mediaInfo.title ||
            t("downloads.unknownTitle", { defaultValue: "Video" })}
        </Text>
        <Text style={[styles.cardSubtitle, { color: statusColor }]}>
          {status} {status === "Downloading" && `• ${progressPercent}`}
        </Text>

        {(status === "Downloading" || status === "Paused") && (
          <View
            style={[
              styles.progressBarBg,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.08)",
              },
            ]}
          >
            <View
              style={[
                styles.progressBarFill,
                { width: progressPercent as any, backgroundColor: colors.tint },
              ]}
            />
          </View>
        )}

        {error && (
          <Text
            style={[styles.errorText, { color: colors.error ?? "#ef4444" }]}
            numberOfLines={1}
          >
            {error}
          </Text>
        )}
      </View>

      <Pressable style={styles.actionBtn} onPress={handleActionablePress}>
        {status === "Downloading" && (
          <Ionicons name="pause" size={24} color={colors.tint} />
        )}
        {(status === "Paused" || status === "Error") && (
          <Ionicons name="play" size={24} color={colors.tint} />
        )}
        {status === "Completed" && (
          <Ionicons name="checkmark-circle" size={24} color="#4ade80" />
        )}
      </Pressable>
    </Pressable>
  );
}

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tasksDict = useDownloadStore((state) => state.tasks);
  const tasks = Object.values(tasksDict).reverse();
  const { clearAll } = useDownloadStore();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Verify and clean stale download tasks
    await useDownloadStore.getState().verifyAndClean?.();
    setRefreshing(false);
  };

  const confirmClearAll = () => {
    if (Platform.OS === "web") {
      if (
        window.confirm(
          t("downloads.alerts.clearAllConfirm", {
            defaultValue:
              "Are you sure you want to clear your download history? Local browser files must be deleted manually.",
          }),
        )
      ) {
        clearAll();
      }
      return;
    }
    Alert.alert(
      t("downloads.alerts.clearAllTitle", {
        defaultValue: "Clear All Downloads",
      }),
      t("downloads.alerts.clearAllMessage", {
        defaultValue:
          "Are you sure? This will delete all downloaded files from your device.",
      }),
      [
        {
          text: t("common.cancel", { defaultValue: "Cancel" }),
          style: "cancel",
        },
        {
          text: t("downloads.alerts.clearAllButton", {
            defaultValue: "Clear All",
          }),
          style: "destructive",
          onPress: () => clearAll(),
        },
      ],
    );
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        size="large"
        icon="cloud-download-outline"
        title={t("downloads.empty.title", { defaultValue: "No Downloads" })}
        description={t("downloads.empty.description", {
          defaultValue: "Movies and shows you download will appear here.",
        })}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.contentWrapper}>
        <View style={styles.headerRow}>
          <Text
            style={[styles.headerSubtitle, { color: colors.textSecondary }]}
          >
            {t("downloads.subtitle", {
              defaultValue: "Manage your offline content",
            })}
          </Text>
          <Pressable onPress={confirmClearAll} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>
              {t("downloads.actions.clearAll", { defaultValue: "Clear All" })}
            </Text>
          </Pressable>
        </View>
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DownloadCard task={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "bold",
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  cardContainer: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardImage: {
    width: 90,
    height: 135,
  },
  cardInfo: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    marginBottom: 8,
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  actionBtn: {
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
});
