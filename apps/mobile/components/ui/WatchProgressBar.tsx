import React from "react";
import { View, StyleSheet } from "react-native";
import type { WatchProgress } from "@streamer/shared";
import { useTheme } from "../../hooks/useTheme";
import { useContinueWatching } from "../../hooks/useContinueWatching";

export function selectCatalogProgress(
  items: WatchProgress[] | undefined,
  itemId: string,
  type: WatchProgress["type"],
): WatchProgress | null {
  return (
    items
      ?.filter((item) => item.itemId === itemId && item.type === type)
      .reduce<WatchProgress | null>((latest, item) => {
        if (!latest) return item;
        const latestTime = Date.parse(latest.lastWatched) || 0;
        const itemTime = Date.parse(item.lastWatched) || 0;
        return itemTime > latestTime ? item : latest;
      }, null) ?? null
  );
}

/**
 * Reads the shared continue-watching cache for an item and renders a thin
 * progress bar overlaid at the bottom of a card when progress is between 3%
 * and 95%.
 */
export function WatchProgressBar({
  itemId,
  type,
  progressColor,
  style,
}: {
  itemId: string;
  type: WatchProgress["type"];
  progressColor?: string;
  style?: object;
}) {
  const { colors } = useTheme();
  const { data: continueWatching } = useContinueWatching();
  const data = React.useMemo(
    () => selectCatalogProgress(continueWatching, itemId, type),
    [continueWatching, itemId, type],
  );

  const progress =
    data && data.duration > 0 ? data.currentTime / data.duration : 0;

  // Only show if meaningfully started and not completed
  if (progress < 0.03 || progress >= 0.95) return null;

  return (
    <View
      style={[styles.track, { backgroundColor: colors.disabled + "55" }, style]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: progressColor ?? colors.tint,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  fill: {
    height: 3,
    borderRadius: 2,
  },
});
