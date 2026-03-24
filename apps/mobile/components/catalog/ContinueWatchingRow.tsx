import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useContinueWatching } from "../../hooks/useContinueWatching";
import { usePlayerStore } from "../../stores/playerStore";
import type { WatchProgress } from "@streamer/shared";

/** Progress bar showing how far through the content */
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  );
}

function ContinueWatchingCard({ item }: { item: WatchProgress }) {
  const router = useRouter();

  const handlePress = () => {
    // Navigate to the detail page for this item
    router.push(`/detail/${item.type}/${item.itemId}`);
  };

  const remainingMinutes = Math.ceil((item.duration - item.currentTime) / 60);

  return (
    <Pressable
      style={styles.card}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Continue watching ${item.title}, ${remainingMinutes} minutes remaining`}
      accessibilityHint="Opens the detail page to resume playback"
    >
      <View style={styles.posterContainer}>
        <Image
          source={{ uri: item.poster ?? undefined }}
          style={styles.poster}
          accessibilityLabel={`${item.title} poster`}
        />
        <ProgressBar current={item.currentTime} total={item.duration} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.cardSub}>
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

  if (isLoading || !items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <Ionicons name="play-circle-outline" size={22} color="#00f2ff" />
          <Text style={styles.sectionTitle}>Continue Watching</Text>
        </View>
        <Pressable style={styles.seeAllBtn}>
          <Text style={styles.seeAllText}>See All</Text>
          <Ionicons name="chevron-forward" size={14} color="#6b7280" />
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
    color: "#ffffff",
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
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 12,
    gap: 14,
  },
  card: {
    width: 240, // Increased width for desktop look
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0a0a14",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  posterContainer: {
    width: 240,
    height: 135, // 16:9 ratio
    backgroundColor: "#121212",
    position: "relative",
  },
  poster: {
    width: 240,
    height: 135,
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  progressFill: {
    height: 3,
    backgroundColor: "#00f2ff",
    borderRadius: 2,
  },
  cardInfo: {
    padding: 12,
  },
  cardTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700",
  },
  cardSub: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
  },
});
