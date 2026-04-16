import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useContinueWatching } from "../../hooks/useContinueWatching";
import { usePlayerStore } from "../../stores/playerStore";
import { useTheme } from "../../hooks/useTheme";
import type { WatchProgress } from "@streamer/shared";

/** Progress bar showing how far through the content */
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.progressTrack,
        {
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.1)"
            : "rgba(0, 0, 0, 0.05)",
        },
      ]}
    >
      <View
        style={[
          styles.progressFill,
          { width: `${pct}%`, backgroundColor: colors.tint },
        ]}
      />
    </View>
  );
}

function ContinueWatchingCard({ item }: { item: WatchProgress }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const cardWidth = isDesktop ? 300 : 220;
  const posterHeight = isDesktop ? 170 : 124;

  const handlePress = () => {
    router.push(`/detail/${item.type}/${item.itemId}`);
  };

  const remainingMinutes = Math.ceil((item.duration - item.currentTime) / 60);

  return (
    <Pressable
      style={({ hovered }: any) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          width: cardWidth,
        },
        Platform.OS === "web" &&
          hovered && {
            borderColor: colors.tint,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
          },
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Continue watching ${item.title}, ${remainingMinutes} minutes remaining`}
      accessibilityHint="Opens the detail page to resume playback"
    >
      <View
        style={[
          styles.posterContainer,
          { width: cardWidth, height: posterHeight },
        ]}
      >
        <Image
          source={{ uri: item.poster ?? undefined }}
          style={{ width: cardWidth, height: posterHeight }}
          accessibilityLabel={`${item.title} poster`}
        />
        <ProgressBar current={item.currentTime} total={item.duration} />
      </View>
      <View style={styles.cardInfo}>
        <Text
          style={[styles.cardTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
          {remainingMinutes}m left
          {item.season != null && item.episode != null
            ? ` · S${item.season}E${item.episode}`
            : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const MemoizedCard = memo(ContinueWatchingCard);

import { Ionicons } from "@expo/vector-icons";

// ... (ProgressBar and ContinueWatchingCard components stay mostly same, just updating styles)

/** Continue Watching horizontal row for the Discover/Home screen */
export function ContinueWatchingRow() {
  const { data: items, isLoading } = useContinueWatching();
  const { colors } = useTheme();

  if (isLoading || !items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <Ionicons name="play-circle-outline" size={22} color={colors.tint} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Continue Watching
          </Text>
        </View>
        <Pressable style={styles.seeAllBtn}>
          <Text style={[styles.seeAllText, { color: colors.textSecondary }]}>
            See All
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) =>
          `cw-${item.itemId}-${item.season}-${item.episode}`
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <MemoizedCard item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  titleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 12,
    gap: 14,
  },
  card: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    // @ts-ignore web-only
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  posterContainer: {
    position: "relative",
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  cardInfo: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  cardSub: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
  },
});
