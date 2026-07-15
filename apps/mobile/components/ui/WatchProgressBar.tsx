import React from "react";
import { View, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import type { WatchProgress } from "@streamer/shared";
import { useTheme } from "../../hooks/useTheme";

/**
 * Fetches watch progress for a specific item and renders a thin progress bar
 * overlaid at the bottom of a card when progress is between 3% and 95%.
 */
export function WatchProgressBar({
  itemId,
  style,
}: {
  itemId: string;
  style?: object;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { colors } = useTheme();

  const { data } = useQuery<WatchProgress | null>({
    queryKey: ["progress", "item", itemId],
    queryFn: async () => {
      try {
        const { data } = await api.get<WatchProgress>(
          `/api/library/progress/${itemId}`,
        );
        return data;
      } catch {
        return null;
      }
    },
    enabled: isAuthenticated && !!itemId,
    staleTime: 60 * 1000,
    retry: false, // Prevents N+1 exponential retry bursts when progress is expectedly missing (404)
  });

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
            backgroundColor: colors.tint,
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
