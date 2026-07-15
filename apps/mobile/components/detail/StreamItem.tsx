import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Stream } from "@streamer/shared";
import { hapticImpactLight } from "../../lib/haptics";
import {
  isTaskOfflinePlayable,
  useDownloadStore,
} from "../../stores/downloadStore";
import {
  streamEngineManager,
  type BridgeStatus,
} from "../../services/streamEngine/StreamEngineManager";
import { getBridgeStatusPresentation } from "../../services/streamEngine/bridgeStatusPresentation";
import { getDownloadEligibility } from "../../services/DownloadService";
import { useTheme } from "../../hooks/useTheme";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";

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
  const isPreparing = task?.status === "Preparing";
  const isDownloading = task?.status === "Downloading";
  const isVerifying = task?.status === "Verifying";
  const isCompleted = isTaskOfflinePlayable(task);
  const isInProgress = isPreparing || isDownloading || isVerifying;
  const progress = task?.progress || 0;
  const url = stream.url?.toLowerCase() ?? "";
  const isHls = url.includes(".m3u8");
  const isTorrent = !!stream.infoHash && !stream.url;
  const bridgeStatus = streamEngineManager.bridgeStatus as BridgeStatus;
  const playable = !!engine;
  const canDownload = getDownloadEligibility(stream).canDownload;
  const bridgePresentation = getBridgeStatusPresentation(bridgeStatus);
  const surfaceColor = colors.surfaceElevated;
  const badgeSurface = colors.tint + "18";
  const readySurface = colors.success + "20";
  const warnSurface = colors.warning + "20";
  const handlePlayPress = () => {
    hapticImpactLight();
    onPress();
  };
  const handleDownloadPress = () => {
    hapticImpactLight();
    onDownload();
  };
  const { isKeyboardFocused: isPlayFocused, webPressableProps: playProps } =
    useWebPressableActivation(handlePlayPress);
  const {
    isKeyboardFocused: isDownloadFocused,
    webPressableProps: downloadProps,
  } = useWebPressableActivation(handleDownloadPress);

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
          borderColor: "transparent",
        },
      ]}
    >
      <Pressable
        {...playProps}
        style={[
          styles.streamPressArea,
          isPlayFocused && styles.webFocused,
          isPlayFocused && { outlineColor: colors.focus },
        ]}
        onPress={handlePlayPress}
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
              <Text style={[styles.seederBadge, { color: colors.success }]}>
                {stream.seeders} peers
              </Text>
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
              <View
                style={[
                  styles.downloadedBadge,
                  { backgroundColor: colors.success + "20" },
                ]}
              >
                <Text
                  style={[
                    styles.downloadedBadgeText,
                    { color: colors.success },
                  ]}
                >
                  Offline
                </Text>
              </View>
            )}
          </View>
        </View>
        <View
          style={[
            styles.playButton,
            { backgroundColor: playable ? colors.primary : "transparent" },
          ]}
        >
          <Ionicons
            name={playable ? "play" : "alert-circle-outline"}
            size={playable ? 17 : 24}
            color={playable ? colors.onPrimary : colors.warning}
          />
        </View>
      </Pressable>

      <View style={styles.streamActions}>
        {canDownload || isInProgress || isCompleted ? (
          <Pressable
            {...(isCompleted || isInProgress ? {} : downloadProps)}
            style={[
              styles.downloadIconBtn,
              isDownloadFocused && styles.webFocused,
              isDownloadFocused && { outlineColor: colors.focus },
            ]}
            onPress={handleDownloadPress}
            disabled={isCompleted || isInProgress}
            accessibilityRole="button"
            accessibilityLabel="Download stream"
          >
            {isPreparing ? (
              <Text style={[styles.progressText, { color: colors.tint }]}>
                Prep
              </Text>
            ) : isDownloading || isVerifying || task?.status === "Paused" ? (
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
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  streamEngine: {
    fontSize: 11,
    fontWeight: "800",
  },
  seederBadge: {
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 4,
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },
  downloadedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  downloadedBadgeText: {
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  webFocused: {
    // @ts-ignore web-only
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineOffset: 2,
  } as any,
  progressText: {
    fontSize: 13,
    fontWeight: "900",
  },
});
