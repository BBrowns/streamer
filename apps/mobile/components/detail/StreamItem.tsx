import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect } from "react";
import type { Stream } from "@streamer/shared";
import { hapticImpactLight } from "../../lib/haptics";
import { useDownloadStore } from "../../stores/downloadStore";
import { streamEngineManager } from "../../services/streamEngine/StreamEngineManager";

export function StreamItem({
  stream,
  index,
  onPress,
  onDownload,
}: {
  stream: Stream;
  index: number;
  onPress: () => void;
  onDownload: () => void;
}) {
  const [playable, setPlayable] = useState(false);
  const engine = streamEngineManager.resolveEngine(stream);
  const id = stream.infoHash || stream.url || `stream_${index}`;
  const task = useDownloadStore((state) => state.tasks[id]);
  const isDownloading = task?.status === "Downloading";
  const isCompleted = task?.status === "Completed";
  const progress = task?.progress || 0;

  useEffect(() => {
    let isMounted = true;
    streamEngineManager.getPlaybackUri(stream).then((uri) => {
      if (isMounted) setPlayable(!!uri && uri.length > 0);
    });
    return () => {
      isMounted = false;
    };
  }, [stream]);

  return (
    <Pressable
      style={[styles.streamCard, !playable && styles.streamCardDisabled]}
      onPress={() => {
        hapticImpactLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${playable ? "Play" : "Torrent"} stream: ${stream.title || stream.name || `Stream ${index + 1}`}`}
      accessibilityHint={
        playable
          ? "Opens the video player"
          : "Requires the stream-server bridge"
      }
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.streamTitle}>
          {stream.title || stream.name || `Stream ${index + 1}`}
        </Text>
        <View style={styles.streamBadgeRow}>
          {stream.resolution && (
            <View style={styles.resBadge}>
              <Text style={styles.resBadgeText}>
                {stream.resolution === "2160p"
                  ? "4K"
                  : stream.resolution.toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.streamEngine}>
            {engine?.getEngineType().toUpperCase() || "UNKNOWN"}
          </Text>
          {stream.seeders !== undefined && (
            <Text style={styles.seederBadge}>👥 {stream.seeders}</Text>
          )}
          {!playable && (
            <View style={styles.torrentBadge}>
              <Text style={styles.torrentBadgeText}>TORRENT</Text>
            </View>
          )}
          {playable && (
            <View style={styles.playableBadge}>
              <Text style={styles.playableBadgeText}>PLAYABLE</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.streamActions}>
        <Pressable
          style={styles.downloadIconBtn}
          onPress={() => {
            hapticImpactLight();
            onDownload();
          }}
          disabled={!playable || isCompleted}
        >
          {isDownloading || task?.status === "Paused" ? (
            <Text style={{ color: "#818cf8", fontSize: 13, fontWeight: "900" }}>
              {(progress * 100).toFixed(0)}%
            </Text>
          ) : (
            <Ionicons
              name={isCompleted ? "cloud-offline" : "download-outline"}
              size={22}
              color={isCompleted ? "#4ade80" : playable ? "#818cf8" : "#3f3f46"}
            />
          )}
        </Pressable>

        <Text style={[styles.playIcon, !playable && styles.playIconDisabled]}>
          {playable ? "▶" : "🔒"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  streamCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#080808",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  streamCardDisabled: {
    opacity: 0.4,
  },
  streamTitle: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 8,
  },
  streamBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resBadge: {
    backgroundColor: "rgba(0,242,255,0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resBadgeText: {
    color: "#00f2ff",
    fontSize: 10,
    fontWeight: "800",
  },
  streamEngine: {
    color: "#555555",
    fontSize: 11,
    fontWeight: "800",
  },
  seederBadge: {
    color: "#00ff88",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 4,
  },
  torrentBadge: {
    backgroundColor: "rgba(255, 214, 0, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  torrentBadgeText: {
    color: "#ffd600",
    fontSize: 10,
    fontWeight: "900",
  },
  playableBadge: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  playableBadgeText: {
    color: "#00f2ff",
    fontSize: 10,
    fontWeight: "900",
  },
  streamActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  downloadIconBtn: {
    padding: 4,
  },
  playIcon: {
    color: "#ffffff",
    fontSize: 24,
  },
  playIconDisabled: {
    color: "#333333",
  },
});
