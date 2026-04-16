import React from "react";
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
import Animated from "react-native-reanimated";
import { hapticImpactLight, hapticImpactHeavy } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";

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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = React.useState(false);
  const isWeb = Platform.OS === "web";
  const itemId = item.itemId || item.id;

  const tasks = useDownloadStore((state) => state.tasks);
  const task = Object.values(tasks).find((t) => t.mediaInfo.itemId === itemId);

  const isDownloading = task?.status === "Downloading";
  const isCompleted = task?.status === "Completed";
  const progress = task?.progress || 0;

  const handlePress = () => {
    hapticImpactLight();
    if (isSelectionMode) {
      onToggleSelect(itemId);
    } else {
      router.push(`/detail/${item.type}/${itemId}`);
    }
  };

  const handleLongPress = () => {
    hapticImpactHeavy();
    if (isSelectionMode) return;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t("common.cancel", { defaultValue: "Cancel" }),
            t("library.actions.viewDetails", { defaultValue: "View Details" }),
            task
              ? t("library.actions.removeDownload", {
                  defaultValue: "Remove Download",
                })
              : t("library.actions.remove", {
                  defaultValue: "Remove from Library",
                }),
          ],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
          title: item.title,
          message: t("library.actions.prompt", {
            defaultValue: "What would you like to do?",
          }),
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
      Alert.alert(
        item.title,
        t("library.actions.prompt", {
          defaultValue: "What would you like to do?",
        }),
        [
          {
            text: t("common.cancel", { defaultValue: "Cancel" }),
            style: "cancel",
          },
          {
            text: t("library.actions.viewDetails", {
              defaultValue: "View Details",
            }),
            onPress: () => router.push(`/detail/${item.type}/${itemId}`),
          },
          {
            text: task
              ? t("library.actions.removeDownload", {
                  defaultValue: "Remove Download",
                })
              : t("library.actions.remove", { defaultValue: "Remove" }),
            style: "destructive",
            onPress: () => onRemove(itemId, !!task),
          },
        ],
      );
    }
  };

  return (
    <Pressable
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.card,
          borderColor:
            isSelectionMode && isSelected
              ? colors.tint
              : isWeb && isHovered
                ? colors.tint
                : colors.border,
          borderWidth: isSelectionMode && isSelected ? 2 : 1,
        },
        isSelectionMode && isSelected && styles.cardSelected,
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onPointerEnter={isWeb ? () => setIsHovered(true) : undefined}
      onPointerLeave={isWeb ? () => setIsHovered(false) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. Long press for options`}
      accessibilityHint="Opens detail page"
    >
      <View>
        <Animated.Image
          source={{ uri: item.poster ?? undefined }}
          style={[
            styles.cardImage,
            isSelectionMode && isSelected && styles.cardImageSelected,
            isWeb && isHovered && styles.cardImageHovered,
          ]}
          sharedTransitionTag={`poster-${itemId}`}
          accessibilityLabel={`${item.title} poster`}
        />
        {isSelectionMode && (
          <View style={styles.checkboxOverlay}>
            <Ionicons
              name={isSelected ? "checkmark-circle" : "ellipse-outline"}
              size={28}
              color={isSelected ? colors.tint : "rgba(255,255,255,0.7)"}
            />
          </View>
        )}

        {/* Desktop hover overlay */}
        {isWeb && isHovered && !isSelectionMode && (
          <View style={styles.hoverOverlay}>
            <Pressable
              style={[styles.hoverPlayBtn, { backgroundColor: colors.tint }]}
              onPress={handlePress}
            >
              <Ionicons
                name="play"
                size={14}
                color={isDark ? "#000" : "#fff"}
              />
              <Text
                style={[
                  styles.hoverPlayText,
                  { color: isDark ? "#000" : "#fff" },
                ]}
              >
                Play
              </Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text
          style={[styles.cardTitle, { color: colors.text }]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={styles.cardTypeRow}>
          <Ionicons
            name={item.type === "movie" ? "film-outline" : "tv-outline"}
            size={11}
            color={colors.textSecondary}
          />
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            {item.type === "movie" ? "Movie" : "Series"}
          </Text>
        </View>
        {isDownloading && (
          <View
            style={[
              styles.progressContainer,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.08)",
              },
            ]}
          >
            <View
              style={[
                styles.progressBar,
                { width: `${progress * 100}%`, backgroundColor: colors.tint },
              ]}
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
    borderRadius: 16,
    overflow: "hidden",
    // Removed maxWidth: 260 — let the responsive grid handle sizing
    minHeight: 44,
    // @ts-ignore web-only
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
  },
  cardImageHovered: {
    opacity: 0.85,
  },
  cardImageSelected: {
    opacity: 0.8,
  },
  // Desktop hover overlay
  hoverOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  } as any,
  hoverPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    // @ts-ignore web-only
    cursor: "pointer",
  } as any,
  hoverPlayText: {
    fontWeight: "800",
    fontSize: 13,
  },
  cardInfo: { padding: 8 },
  cardTitle: { fontSize: 13, fontWeight: "600" },
  cardSubtitle: { fontSize: 11, marginTop: 4 },
  progressContainer: {
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
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
    shadowColor: "#00f2ff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
