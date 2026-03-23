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

/** Continue Watching horizontal row for the Discover/Home screen */
export function ContinueWatchingRow() {
  const { data: items, isLoading } = useContinueWatching();

  if (isLoading || !items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>▶️ Continue Watching</Text>
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
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    paddingHorizontal: 16,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  listContent: {
    paddingHorizontal: 12,
    gap: 10,
  },
  card: {
    width: 180,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  posterContainer: {
    width: 180,
    height: 101,
    backgroundColor: "#121212",
    position: "relative",
  },
  poster: {
    width: 180,
    height: 101,
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  progressFill: {
    height: 4,
    backgroundColor: "#00f2ff",
  },
  cardInfo: {
    padding: 8,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  cardSub: {
    color: "#888888",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
