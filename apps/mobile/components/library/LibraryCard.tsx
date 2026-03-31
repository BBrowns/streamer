import {
  View,
  Text,
  Image,
  Pressable,
  ActionSheetIOS,
  Platform,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import type { LibraryItem } from "@streamer/shared";
import { useDownloadStore } from "../../stores/downloadStore";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

export function LibraryCard({
  item,
  onRemove,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: {
  item: LibraryItem;
  onRemove: (id: string, isDownload?: boolean) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const router = useRouter();
  const itemId = item.itemId || item.id;

  const tasks = useDownloadStore((state) => state.tasks);
  const task = Object.values(tasks).find((t) => t.mediaInfo.itemId === itemId);

  const isDownloading = task?.status === "Downloading";
  const isCompleted = task?.status === "Completed";
  const progress = task?.progress || 0;

  const handlePress = () => {
    if (isSelectionMode) {
      onToggleSelect(itemId);
    } else {
      router.push(`/detail/${item.type}/${itemId}`);
    }
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isSelectionMode) return;
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
      style={[
        styles.cardContainer,
        isSelectionMode && isSelected && styles.cardSelected,
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. Long press for options`}
      accessibilityHint="Opens detail page"
    >
      <View>
        <Image
          source={{ uri: item.poster ?? undefined }}
          style={[
            styles.cardImage,
            isSelectionMode && isSelected && styles.cardImageSelected,
          ]}
          accessibilityLabel={`${item.title} poster`}
        />
        {isSelectionMode && (
          <View style={styles.checkboxOverlay}>
            <Ionicons
              name={isSelected ? "checkmark-circle" : "ellipse-outline"}
              size={28}
              color={isSelected ? "#00f2ff" : "rgba(255,255,255,0.7)"}
            />
          </View>
        )}
      </View>
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

const styles = StyleSheet.create({
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
  cardSelected: {
    borderColor: "#00f2ff",
    borderWidth: 2,
  },
  cardImageSelected: {
    opacity: 0.8,
  },
  checkboxOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 16,
    padding: 2,
  },
});
