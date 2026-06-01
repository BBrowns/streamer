import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Stream } from "@streamer/shared";
import { hapticImpactLight } from "../../lib/haptics";
import { useDownloadStore } from "../../stores/downloadStore";
import {
  streamEngineManager,
  type BridgeStatus,
} from "../../services/streamEngine/StreamEngineManager";
import { getBridgeStatusPresentation } from "../../services/streamEngine/bridgeStatusPresentation";
import { getDownloadEligibility } from "../../services/DownloadService";
import { useTheme } from "../../hooks/useTheme";

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
  const { colors, isDark } = useTheme();
  const engine = streamEngineManager.resolveEngine(stream);
  const id = stream.infoHash || stream.url || `stream_${index}`;
  const task = useDownloadStore((state) => state.tasks[id]);
  const isDownloading = task?.status === "Downloading";
  const isCompleted = task?.status === "Completed";
  const progress = task?.progress || 0;
  const url = stream.url?.toLowerCase() ?? "";
  const isHls = url.includes(".m3u8");
  const isTorrent = !!stream.infoHash && !stream.url;
  const bridgeStatus = streamEngineManager.bridgeStatus as BridgeStatus;
  const playable = !!engine;
  const canDownload = getDownloadEligibility(stream).canDownload;
  const bridgePresentation = getBridgeStatusPresentation(bridgeStatus);
  const surfaceColor = isDark ? "rgba(255,255,255,0.08)" : colors.card;
  const badgeSurface = isDark ? "rgba(242,215,255,0.12)" : "#f3edf8";
  const readySurface = isDark ? "rgba(197,233,213,0.18)" : "#e7f6ee";
  const warnSurface = isDark ? "rgba(255,219,166,0.18)" : "#fff3df";

  const sourceStateLabel = isTorrent
    ? bridgeStatus === "available"
      ? "Bridge ready"
      : bridgePresentation.badge
    : isHls
      ? "Streaming only"
      : "Direct file";

  return (
    <View
      style={[
        styles.streamCard,
        {
          backgroundColor: surfaceColor,
          borderColor: colors.border,
        },
      ]}
    >
      <Pressable
        style={styles.streamPressArea}
        onPress={() => {
          hapticImpactLight();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Play stream: ${stream.title || stream.name || `Stream ${index + 1}`}`}
        accessibilityHint={
          isTorrent && bridgeStatus !== "available"
            ? "Checks whether the stream-server bridge is available"
            : "Opens the video player"
        }
      >
        <View style={styles.streamInfo}>
          <Text style={[styles.streamTitle, { color: colors.text }]}>
            {stream.title || stream.name || `Stream ${index + 1}`}
          </Text>
          <View style={styles.streamBadgeRow}>
            {stream.resolution && (
              <View
                style={[
                  styles.resBadge,
                  { backgroundColor: colors.tint + (isDark ? "29" : "1f") },
                ]}
              >
                <Text style={[styles.resBadgeText, { color: colors.tint }]}>
                  {stream.resolution === "2160p"
                    ? "4K"
                    : stream.resolution.toUpperCase()}
                </Text>
              </View>
            )}
            <Text
              style={[styles.streamEngine, { color: colors.textSecondary }]}
            >
              {engine?.getEngineType().toUpperCase() || "UNKNOWN"}
            </Text>
            {stream.seeders !== undefined && (
              <Text style={styles.seederBadge}>{stream.seeders} peers</Text>
            )}
            <View
              style={[
                styles.sourceBadge,
                { backgroundColor: badgeSurface },
                isTorrent &&
                  bridgeStatus !== "available" && {
                    backgroundColor: warnSurface,
                  },
                !isTorrent &&
                  !isHls && {
                    backgroundColor: readySurface,
                  },
              ]}
            >
              <Text
                style={[
                  styles.sourceBadgeText,
                  { color: colors.tint },
                  isTorrent &&
                    bridgeStatus !== "available" && { color: colors.warning },
                  !isTorrent && !isHls && { color: colors.success },
                ]}
              >
                {sourceStateLabel}
              </Text>
            </View>
            {isCompleted && (
              <View style={styles.downloadedBadge}>
                <Text style={styles.downloadedBadgeText}>Offline</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons
          name={playable ? "play-circle" : "alert-circle-outline"}
          size={28}
          color={playable ? colors.tint : colors.warning}
        />
      </Pressable>

      <View style={styles.streamActions}>
        {canDownload || isDownloading || isCompleted ? (
          <Pressable
            style={styles.downloadIconBtn}
            onPress={() => {
              hapticImpactLight();
              onDownload();
            }}
            disabled={isCompleted}
            accessibilityRole="button"
            accessibilityLabel="Download stream"
          >
            {isDownloading || task?.status === "Paused" ? (
              <Text style={[styles.progressText, { color: colors.tint }]}>
                {(progress * 100).toFixed(0)}%
              </Text>
            ) : (
              <Ionicons
                name={isCompleted ? "cloud-offline" : "download-outline"}
                size={22}
                color={isCompleted ? colors.success : colors.tint}
              />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  streamCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  streamPressArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  streamInfo: {
    flex: 1,
    minWidth: 0,
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
    flexWrap: "wrap",
  },
  resBadge: {
    backgroundColor: "rgba(242,215,255,0.16)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resBadgeText: {
    color: "#f2d7ff",
    fontSize: 10,
    fontWeight: "800",
  },
  streamEngine: {
    color: "#b8adc8",
    fontSize: 11,
    fontWeight: "800",
  },
  seederBadge: {
    color: "#9fd9b5",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 4,
  },
  sourceBadge: {
    backgroundColor: "rgba(242,215,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sourceBadgeWarn: {
    backgroundColor: "rgba(255, 219, 166, 0.18)",
  },
  sourceBadgeReady: {
    backgroundColor: "rgba(197, 233, 213, 0.18)",
  },
  sourceBadgeText: {
    color: "#f2d7ff",
    fontSize: 10,
    fontWeight: "900",
  },
  sourceBadgeWarnText: {
    color: "#ffdba6",
  },
  sourceBadgeReadyText: {
    color: "#c5e9d5",
  },
  downloadedBadge: {
    backgroundColor: "rgba(197, 233, 213, 0.14)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  downloadedBadgeText: {
    color: "#c5e9d5",
    fontSize: 10,
    fontWeight: "900",
  },
  streamActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginLeft: 14,
  },
  downloadIconBtn: {
    padding: 4,
  },
  progressText: {
    color: "#f2d7ff",
    fontSize: 13,
    fontWeight: "900",
  },
});
