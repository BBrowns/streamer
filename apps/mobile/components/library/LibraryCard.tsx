import React from "react";
import {
  View,
  Text,
  Pressable,
  ActionSheetIOS,
  Platform,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import type { LibraryItem } from "@streamer/shared";
import {
  isTaskOfflinePlayable,
  useDownloadStore,
} from "../../stores/downloadStore";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { hapticImpactLight, hapticImpactHeavy } from "../../lib/haptics";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";

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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const isWeb = Platform.OS === "web";
  const itemId = item.itemId || item.id;

  const tasks = useDownloadStore((state) => state.tasks);
  const task = Object.values(tasks).find((t) => t.mediaInfo.itemId === itemId);

  const isPreparing = task?.status === "Preparing";
  const isDownloading =
    task?.status === "Downloading" ||
    task?.status === "Verifying" ||
    isPreparing;
  const isCompleted = isTaskOfflinePlayable(task);
  const progress = task?.progress || 0;
  const detailsLabel = t("library.actions.viewDetails", {
    defaultValue: "View Details",
  });
  const removeLabel = task
    ? t("library.actions.removeDownload", {
        defaultValue: "Remove Download",
      })
    : t("library.actions.remove", {
        defaultValue: "Remove from Library",
      });
  const cardAccessibilityLabel = isSelectionMode
    ? `${t("library.header.select")}: ${item.title}`
    : `${detailsLabel}: ${item.title}`;

  const handlePress = () => {
    hapticImpactLight();
    if (isSelectionMode) {
      onToggleSelect(itemId);
    } else {
      router.push(`/detail/${item.type}/${itemId}`);
    }
  };
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(handlePress);

  const handleContextMenu = (e: any) => {
    if (!isWeb || isSelectionMode) return;
    e.preventDefault();
    setContextMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  };

  React.useEffect(() => {
    if (!contextMenu) return;
    const hideMenu = () => setContextMenu(null);
    window.addEventListener("click", hideMenu);
    window.addEventListener("contextmenu", hideMenu);
    return () => {
      window.removeEventListener("click", hideMenu);
      window.removeEventListener("contextmenu", hideMenu);
    };
  }, [contextMenu]);

  const handleLongPress = () => {
    hapticImpactHeavy();
    if (isSelectionMode) return;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t("common.cancel", { defaultValue: "Cancel" }),
            detailsLabel,
            removeLabel,
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
            text: detailsLabel,
            onPress: () => router.push(`/detail/${item.type}/${itemId}`),
          },
          {
            text: removeLabel,
            style: "destructive",
            onPress: () => onRemove(itemId, !!task),
          },
        ],
      );
    }
  };

  return (
    <View
      style={[
        styles.cardContainer,
        {
          borderColor:
            isSelectionMode && isSelected ? colors.tint : "transparent",
          borderWidth: isSelectionMode && isSelected ? 2 : 0,
        },
        isSelectionMode && isSelected && styles.cardSelected,
      ]}
    >
      <Pressable
        {...webPressableProps}
        style={({ pressed }) => [
          styles.cardPressable,
          pressed && styles.cardPressed,
          isWeb && isKeyboardFocused && styles.cardFocused,
          isWeb && isKeyboardFocused && { outlineColor: colors.focus },
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPointerEnter={isWeb ? () => setIsHovered(true) : undefined}
        onPointerLeave={isWeb ? () => setIsHovered(false) : undefined}
        // @ts-ignore web-only context menu
        onContextMenu={isWeb ? handleContextMenu : undefined}
        accessibilityRole={isSelectionMode ? "checkbox" : "button"}
        accessibilityLabel={cardAccessibilityLabel}
        accessibilityHint={
          isSelectionMode ? undefined : t("search.a11y.openDetails")
        }
        accessibilityState={
          isSelectionMode ? { checked: isSelected } : undefined
        }
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
            accessibilityLabel={t("search.a11y.poster", {
              title: item.title,
              defaultValue: `${item.title} poster`,
            })}
          />
          {isSelectionMode && (
            <View style={styles.checkboxOverlay} pointerEvents="none">
              <Ionicons
                name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                size={28}
                color={isSelected ? colors.tint : colors.onTint}
              />
            </View>
          )}

          {isWeb && isHovered && !isSelectionMode && (
            <View style={styles.hoverOverlay} pointerEvents="none">
              <View
                style={[
                  styles.hoverAction,
                  { backgroundColor: colors.surfaceOverlay },
                ]}
              >
                <Text style={[styles.hoverActionText, { color: colors.text }]}>
                  {detailsLabel}
                </Text>
                <Ionicons name="arrow-forward" size={14} color={colors.text} />
              </View>
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
            <Text
              style={[styles.cardSubtitle, { color: colors.textSecondary }]}
            >
              {t(`search.types.${item.type}`)}
            </Text>
          </View>
          {isDownloading && (
            <View
              style={[
                styles.progressContainer,
                { backgroundColor: colors.disabled },
              ]}
            >
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${progress * 100}%`,
                    backgroundColor: colors.tint,
                  },
                ]}
              />
            </View>
          )}
          {isCompleted && (
            <View style={styles.downloadBadge}>
              <Ionicons
                name="arrow-down-circle"
                size={13}
                color={colors.success}
              />
              <Text
                style={[styles.downloadBadgeText, { color: colors.success }]}
              >
                {t("library.filters.offline")}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {isWeb && contextMenu && (
        <View
          accessibilityViewIsModal
          style={[
            styles.contextMenu,
            {
              top: contextMenu.y,
              left: contextMenu.x,
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <Pressable
            style={({ hovered, pressed, focused }: any) => [
              styles.contextMenuItem,
              hovered && { backgroundColor: colors.card },
              pressed && { opacity: 0.72 },
              focused && getWebFocusStyle(colors.focus),
            ]}
            onPress={() => {
              setContextMenu(null);
              router.push(`/detail/${item.type}/${itemId}`);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${detailsLabel}: ${item.title}`}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={colors.text}
            />
            <Text style={[styles.contextMenuText, { color: colors.text }]}>
              {detailsLabel}
            </Text>
          </Pressable>
          <View
            style={[
              styles.contextMenuSeparator,
              { backgroundColor: colors.border },
            ]}
          />
          <Pressable
            style={({ hovered, pressed, focused }: any) => [
              styles.contextMenuItem,
              hovered && { backgroundColor: colors.card },
              pressed && { opacity: 0.72 },
              focused && getWebFocusStyle(colors.focus),
            ]}
            onPress={() => {
              setContextMenu(null);
              onRemove(itemId, !!task);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${removeLabel}: ${item.title}`}
          >
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={[styles.contextMenuText, { color: colors.error }]}>
              {removeLabel}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
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
    borderRadius: uiRadii.card,
    position: "relative",
  },
  cardPressable: {
    minHeight: uiTouchTarget,
    borderRadius: uiRadii.card,
    // @ts-ignore web-only
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  cardPressed: {
    opacity: 0.78,
  },
  cardFocused: {
    // @ts-ignore web-only
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineOffset: 3,
  } as any,
  cardImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: uiRadii.card,
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
    justifyContent: "flex-end",
    alignItems: "flex-start",
    padding: 12,
  } as any,
  hoverAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
    minHeight: uiTouchTarget,
    paddingHorizontal: uiSpacing.md,
    paddingVertical: uiSpacing.sm,
    borderRadius: uiRadii.control,
  },
  hoverActionText: {
    ...uiTypography.label,
  },
  cardInfo: { paddingTop: 8, paddingHorizontal: 2, paddingBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: "700" },
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
    fontSize: 10,
    fontWeight: "700",
  },
  cardSelected: {
    ...(Platform.OS === "web"
      ? { boxShadow: "0 0 0 3px rgba(108,121,245,0.24)" }
      : {
          shadowColor: "#6C79F5",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        }),
  } as any,
  checkboxOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 16,
    padding: 2,
  },
  contextMenu: {
    position: "absolute",
    zIndex: 1000,
    width: 200,
    borderRadius: 12,
    borderWidth: 1,
    padding: 6,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.2,
          shadowRadius: 16,
        }),
    elevation: 10,
  } as any,
  contextMenuItem: {
    minHeight: uiTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  contextMenuText: {
    fontSize: 13,
    fontWeight: "600",
  },
  contextMenuSeparator: {
    height: 1,
    marginVertical: 4,
    marginHorizontal: 8,
    opacity: 0.5,
  },
});
