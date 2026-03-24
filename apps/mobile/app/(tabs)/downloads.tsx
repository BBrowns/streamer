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
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useDownloadStore, DownloadTask } from "../../stores/downloadStore";
import { downloadService } from "../../services/DownloadService";

function DownloadCard({ task }: { task: DownloadTask }) {
  const router = useRouter();
  const { mediaInfo, progress, status, id, error } = task;

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const title = mediaInfo.title || "Unknown Download";
    const deleteAction = () => downloadService.deleteDownload(id);

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "View Details", "Delete Download"],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
          title,
          message: "Manage your downloaded media",
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
      Alert.alert(title, "Manage your downloaded media", [
        { text: "Cancel", style: "cancel" },
        {
          text: "View Details",
          onPress: () => {
            if (mediaInfo.itemId)
              router.push(`/detail/${mediaInfo.type}/${mediaInfo.itemId}`);
          },
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: deleteAction,
        },
      ]);
    }
  };

  const handlePress = () => {
    if (mediaInfo.itemId) {
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
      handlePress(); // Typically route to player/detail
    } else if (status === "Error") {
      downloadService.resumeDownload(id); // try to restart
    }
  };

  const progressPercent = (progress * 100).toFixed(0) + "%";
  const isDownloading = status === "Downloading";

  return (
    <Pressable
      style={styles.cardContainer}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <Image
        source={{ uri: mediaInfo.poster ?? undefined }}
        style={styles.cardImage}
      />
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {mediaInfo.title || "Video"}
        </Text>
        <Text style={styles.cardSubtitle}>
          {status} {status === "Downloading" && `• ${progressPercent}`}
        </Text>

        {(status === "Downloading" || status === "Paused") && (
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: progressPercent as any },
              ]}
            />
          </View>
        )}

        {error && (
          <Text style={styles.errorText} numberOfLines={1}>
            {error}
          </Text>
        )}
      </View>

      <Pressable style={styles.actionBtn} onPress={handleActionablePress}>
        {status === "Downloading" && (
          <Ionicons name="pause" size={24} color="#00f2ff" />
        )}
        {(status === "Paused" || status === "Error") && (
          <Ionicons name="play" size={24} color="#00f2ff" />
        )}
        {status === "Completed" && (
          <Ionicons name="checkmark-circle" size={24} color="#00f2ff" />
        )}
      </Pressable>
    </Pressable>
  );
}

export default function DownloadsScreen() {
  const tasksDict = useDownloadStore((state) => state.tasks);
  const tasks = Object.values(tasksDict).reverse(); // newest first
  const { clearAll } = useDownloadStore();

  const confirmClearAll = () => {
    if (Platform.OS === "web") {
      if (
        window.confirm(
          "Are you sure you want to clear your download history? Local browser files must be deleted manually.",
        )
      ) {
        clearAll();
      }
      return;
    }
    Alert.alert(
      "Clear All Downloads",
      "Are you sure? This will delete all downloaded files from your device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: () => clearAll() },
      ],
    );
  };

  if (tasks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cloud-download-outline" size={64} color="#374151" />
        <Text style={styles.emptyTitle}>No Downloads</Text>
        <Text style={styles.emptyText}>
          Movies and shows you download will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.contentWrapper}>
        <View style={styles.headerRow}>
          <Text style={styles.headerSubtitle}>Manage your offline content</Text>
          <Pressable onPress={confirmClearAll} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear All</Text>
          </Pressable>
        </View>
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DownloadCard task={item} />}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#010101",
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
    color: "#6b7280",
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
  emptyContainer: {
    flex: 1,
    backgroundColor: "#010101",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 15,
    textAlign: "center",
    marginTop: 8,
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  cardContainer: {
    flexDirection: "row",
    backgroundColor: "#080808",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  cardImage: {
    width: 90,
    height: 135,
    backgroundColor: "#111",
  },
  cardInfo: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardSubtitle: {
    color: "#9ca3af",
    fontSize: 13,
    marginBottom: 8,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    marginTop: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#00f2ff",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 4,
  },
  actionBtn: {
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
});
