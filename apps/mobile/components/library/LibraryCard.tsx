import React from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { hapticImpactHeavy, hapticImpactLight } from "../../lib/haptics";
import {
  isTaskOfflinePlayable,
  useDownloadStore,
} from "../../stores/downloadStore";
import { useTheme } from "../../hooks/useTheme";
import { PosterCard } from "../ui/PosterCard";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "../ui/designSystem";
import type { LibraryCardItem } from "./libraryPresentation";

type LibraryCardProps = {
  item: LibraryCardItem;
  selectionKey: string;
  downloadTaskId?: string;
  onRemove?: (itemId: string) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (selectionKey: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function LibraryCard({
  item,
  selectionKey,
  downloadTaskId,
  onRemove,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  style,
}: LibraryCardProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const itemId = item.itemId || item.id;
  const tasks = useDownloadStore((state) => state.tasks);
  const task = downloadTaskId
    ? tasks[downloadTaskId]
    : Object.values(tasks).find(
        (candidate) => candidate.mediaInfo.itemId === itemId,
      );
  const isPreparing = task?.status === "Preparing";
  const isDownloading =
    task?.status === "Downloading" ||
    task?.status === "Verifying" ||
    isPreparing;
  const isCompleted = isTaskOfflinePlayable(task);
  const detailsLabel = t("library.actions.viewDetails", {
    defaultValue: "View details",
  });
  const removeLabel = t("library.actions.remove", {
    defaultValue: "Remove from Library",
  });

  const handlePress = () => {
    hapticImpactLight();
    if (isSelectionMode) onToggleSelect(selectionKey);
    else router.push(`/detail/${item.type}/${itemId}`);
  };

  const showActions = () => {
    if (isSelectionMode || !onRemove) return;
    hapticImpactHeavy();
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t("common.cancel"), detailsLabel, removeLabel],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
          title: item.title,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) router.push(`/detail/${item.type}/${itemId}`);
          if (buttonIndex === 2) onRemove(itemId);
        },
      );
      return;
    }
    Alert.alert(item.title, undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: detailsLabel,
        onPress: () => router.push(`/detail/${item.type}/${itemId}`),
      },
      {
        text: removeLabel,
        style: "destructive",
        onPress: () => onRemove(itemId),
      },
    ]);
  };

  React.useEffect(() => {
    if (!contextMenu || Platform.OS !== "web") return;
    const hide = () => setContextMenu(null);
    window.addEventListener("click", hide);
    window.addEventListener("contextmenu", hide);
    return () => {
      window.removeEventListener("click", hide);
      window.removeEventListener("contextmenu", hide);
    };
  }, [contextMenu]);

  return (
    <View style={[styles.container, style]}>
      <PosterCard
        title={item.title}
        poster={item.poster}
        eyebrow={t(`search.types.${item.type}`)}
        metadata={
          isCompleted
            ? t("downloads.status.readyOffline", {
                defaultValue: "Ready offline",
              })
            : undefined
        }
        progress={isDownloading ? (task?.progress ?? 0) * 100 : undefined}
        selected={isSelected}
        onPress={handlePress}
        onLongPress={onRemove ? showActions : undefined}
        onContextMenu={
          onRemove && !isSelectionMode
            ? (event) => {
                event.preventDefault();
                setContextMenu({
                  x: event.nativeEvent.pageX,
                  y: event.nativeEvent.pageY,
                });
              }
            : undefined
        }
        accessibilityRole={isSelectionMode ? "checkbox" : "button"}
        accessibilityState={
          isSelectionMode ? { checked: isSelected } : undefined
        }
        accessibilityHint={
          isSelectionMode ? undefined : t("search.a11y.openDetails")
        }
        testID={`library-card-${selectionKey}`}
      />

      {Platform.OS === "web" && contextMenu ? (
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
          <ContextAction
            icon="information-circle-outline"
            label={detailsLabel}
            color={colors.text}
            focusColor={colors.focus}
            onPress={() => {
              setContextMenu(null);
              router.push(`/detail/${item.type}/${itemId}`);
            }}
          />
          <View
            style={[styles.separator, { backgroundColor: colors.border }]}
          />
          <ContextAction
            icon="trash-outline"
            label={removeLabel}
            color={colors.error}
            focusColor={colors.focus}
            onPress={() => {
              setContextMenu(null);
              onRemove?.(itemId);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function ContextAction({
  icon,
  label,
  color,
  focusColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  focusColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ hovered, pressed, focused }: any) => [
        styles.contextAction,
        hovered && { backgroundColor: color + "12" },
        pressed && { opacity: 0.72 },
        focused && getWebFocusStyle(focusColor),
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.contextText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    flexGrow: 0,
    flexShrink: 0,
  },
  contextMenu: {
    position: "fixed",
    zIndex: 1000,
    width: 210,
    borderRadius: uiRadii.card,
    borderWidth: 1,
    padding: uiSpacing.xs + 2,
    boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
  } as any,
  contextAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm + 2,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.control,
  },
  contextText: {
    ...uiTypography.label,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: uiSpacing.xs,
    marginHorizontal: uiSpacing.sm,
  },
});
