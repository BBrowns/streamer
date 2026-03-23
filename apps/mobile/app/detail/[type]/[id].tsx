import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions, // NEW
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient"; // NEW
import { Ionicons } from "@expo/vector-icons"; // NEW
import { hapticImpactLight, hapticSuccess } from "../../../lib/haptics"; // NEW
import { useMeta } from "../../../hooks/useMeta";
import { useStreams } from "../../../hooks/useStreams";
import { usePlayerStore } from "../../../stores/playerStore";
import {
  useAddToLibrary,
  useIsInLibrary,
  useRemoveFromLibrary,
} from "../../../hooks/useLibrary";
import { streamEngineManager } from "../../../services/streamEngine/StreamEngineManager";
import type { Stream } from "@streamer/shared";
import type { MediaInfo } from "../../../stores/playerStore";
import { useDownloadStore } from "../../../stores/downloadStore";
import { downloadService } from "../../../services/DownloadService";
import { useCallback, useState, useEffect } from "react";

const { height } = Dimensions.get("window");
const BACKDROP_HEIGHT = height * 0.55;

function StreamItem({
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

export default function DetailScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const castType = type as "movie" | "series";
  const router = useRouter();
  const { data: meta, isLoading: metaLoading } = useMeta(type, id);
  const { data: streams, isLoading: streamsLoading } = useStreams(type, id);
  const setStream = usePlayerStore((s) => s.setStream);

  const [selectedResolution, setSelectedResolution] = useState<string | null>(
    null,
  );
  const [playableMap, setPlayableMap] = useState<Record<string, boolean>>({});
  const { data: inLibrary } = useIsInLibrary(id);
  const addToLibrary = useAddToLibrary();
  const removeFromLibrary = useRemoveFromLibrary();

  useEffect(() => {
    if (!streams || streams.length === 0) return;
    let mounted = true;
    Promise.all(
      streams.map(async (s, i) => {
        const key = s.infoHash || s.url || `stream_${i}`;
        const uri = await streamEngineManager.getPlaybackUri(s);
        return [key, !!uri && uri.length > 0] as [string, boolean];
      }),
    ).then((entries) => {
      if (!mounted) return;
      setPlayableMap(Object.fromEntries(entries));
    });
    return () => {
      mounted = false;
    };
  }, [streams]);

  const handleToggleLibrary = useCallback(() => {
    if (!meta) return;
    hapticImpactLight();
    if (inLibrary) {
      removeFromLibrary.mutate(id);
    } else {
      hapticSuccess();
      addToLibrary.mutate({
        type: castType,
        itemId: id,
        title: meta.name,
        poster: meta.poster,
      });
    }
  }, [meta, inLibrary, id, type, addToLibrary, removeFromLibrary]);

  // Group streams by resolution
  const groupedStreams = (streams || []).reduce(
    (acc, s) => {
      const res = s.resolution || "SD";
      if (!acc[res]) acc[res] = [];
      acc[res].push(s);
      return acc;
    },
    {} as Record<string, Stream[]>,
  );

  const availableResolutions = Object.keys(groupedStreams).sort((a, b) => {
    const order: Record<string, number> = {
      "2160p": 0,
      "1080p": 1,
      "720p": 2,
      "480p": 3,
      SD: 4,
    };
    return (order[a] ?? 99) - (order[b] ?? 99);
  });

  useEffect(() => {
    if (availableResolutions.length > 0 && !selectedResolution) {
      setSelectedResolution(availableResolutions[0]);
    }
  }, [availableResolutions, selectedResolution]);

  if (metaLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00f2ff" />
      </View>
    );
  }

  if (!meta) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Content not found</Text>
      </View>
    );
  }

  const handlePlayStream = async (stream: Stream) => {
    const streamId = stream.infoHash || stream.url;
    const task = useDownloadStore.getState().tasks[streamId || ""];

    if (
      task?.status === "Completed" &&
      task.localUri &&
      task.localUri.length > 5
    ) {
      setStream(
        { ...stream, url: task.localUri },
        {
          type: castType,
          itemId: id || "unknown",
          title: meta?.name ?? stream.title ?? "Unknown",
          poster: meta?.poster,
        },
      );
      router.push("/player");
      return;
    }

    const uri = await streamEngineManager.getPlaybackUri(stream);
    const playable = !!uri && uri.length > 0;

    if (!playable && stream.infoHash) {
      const bridgeUp = await streamEngineManager.detectBridge();
      if (bridgeUp) {
        const retryUri = await streamEngineManager.getPlaybackUri(stream);
        if (retryUri && retryUri.length > 0) {
          const mediaInfo: MediaInfo = {
            type: (type as "movie" | "series") ?? "movie",
            itemId: id || "unknown",
            title: meta?.name ?? stream.title ?? "Unknown",
            poster: meta?.poster,
          };
          setStream(stream, mediaInfo);
          router.push("/player");
          return;
        }
      }
    }

    if (!playable) {
      const msg = stream.infoHash
        ? "This is a torrent stream. Start the stream-server bridge first."
        : "This stream is not playable.";

      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Unsupported Stream", msg);
      return;
    }

    setStream(stream, {
      type: castType,
      itemId: id || "unknown",
      title: meta?.name ?? stream.title ?? "Unknown",
      poster: meta?.poster,
    });
    router.push("/player");
  };

  const handleDownloadStream = async (stream: Stream) => {
    if (!meta) return;
    try {
      await downloadService.startDownload(stream, {
        itemId: id,
        type: castType,
        title: meta.name,
        poster: meta.poster,
      });
    } catch (e) {
      Alert.alert("Download Error", "Failed to start download.");
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Floating Back Button */}
      <Pressable style={styles.floatingBack} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={28} color="#ffffff" />
      </Pressable>

      <ScrollView
        style={styles.container}
        contentInsetAdjustmentBehavior="never"
        bounces={false}
      >
        {/* Full Bleed Backdrop with Gradient */}
        <View style={styles.heroContainer}>
          {!!meta.background ? (
            <Image
              source={{ uri: meta.background }}
              style={styles.backdrop}
              resizeMode="cover"
            />
          ) : !!meta.poster ? (
            <Image
              source={{ uri: meta.poster }}
              style={styles.backdrop}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.backdrop} />
          )}

          <LinearGradient
            colors={["transparent", "rgba(1,1,1,0.6)", "#010101"]}
            locations={[0.4, 0.8, 1]}
            style={styles.heroGradient}
          />
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{meta.name}</Text>

          <View style={styles.metaRow}>
            {!!meta.releaseInfo && (
              <Text style={styles.metaTag}>{meta.releaseInfo}</Text>
            )}
            {!!meta.runtime && (
              <Text style={styles.metaTag}>{meta.runtime}</Text>
            )}
            {!!meta.imdbRating && (
              <Text style={styles.ratingTag}>⭐ {meta.imdbRating}</Text>
            )}
          </View>

          {/* Library Button */}
          <Pressable
            style={[styles.libraryBtn, inLibrary && styles.libraryBtnActive]}
            onPress={handleToggleLibrary}
          >
            <Text
              style={[
                styles.libraryBtnText,
                inLibrary && styles.libraryBtnTextActive,
              ]}
            >
              {inLibrary ? "✓ In Library" : "+ Add to Library"}
            </Text>
          </Pressable>

          {!!meta.genres && meta.genres.length > 0 && (
            <View style={styles.genreRow}>
              {meta.genres.map((g, idx) => (
                <View key={`${g}-${idx}`} style={styles.genrePill}>
                  <Text style={styles.genreText}>{g}</Text>
                </View>
              ))}
            </View>
          )}

          {!!meta.description && (
            <Text style={styles.description}>{meta.description}</Text>
          )}

          {!!meta.cast && meta.cast.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cast</Text>
              <Text style={styles.sectionContent}>{meta.cast.join(", ")}</Text>
            </View>
          )}

          {/* Streams Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎬 Select Quality</Text>

            {streamsLoading ? (
              <ActivityIndicator color="#00f2ff" />
            ) : availableResolutions.length > 0 ? (
              <>
                <View style={styles.resContainer}>
                  {availableResolutions.map((res) => (
                    <Pressable
                      key={res}
                      style={[
                        styles.resBubble,
                        selectedResolution === res && styles.resBubbleActive,
                      ]}
                      onPress={() => {
                        hapticImpactLight();
                        setSelectedResolution(res);
                      }}
                    >
                      <Text
                        style={[
                          styles.resText,
                          selectedResolution === res && styles.resTextActive,
                        ]}
                      >
                        {res === "2160p" ? "4K" : res.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.streamList}>
                  {groupedStreams[selectedResolution!]?.map((stream, i) => {
                    const streamId =
                      stream.infoHash || stream.url || `stream_${i}`;
                    return (
                      <StreamItem
                        key={`${streamId}_${i}`}
                        stream={stream}
                        index={i}
                        onPress={() => handlePlayStream(stream)}
                        onDownload={() => handleDownloadStream(stream)}
                      />
                    );
                  })}
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>
                No streams available. Install more add-ons.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#010101",
  },
  centered: {
    flex: 1,
    backgroundColor: "#010101",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#ff3b3b",
  },
  floatingBack: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroContainer: {
    width: "100%",
    height: BACKDROP_HEIGHT,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  content: {
    padding: 20,
    marginTop: -80,
    zIndex: 2,
    minHeight: height * 0.6,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaTag: {
    color: "#888888",
    fontSize: 13,
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingTag: {
    color: "#ffd600",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(255,214,0,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  libraryBtn: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 242, 255, 0.2)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "flex-start",
    marginBottom: 24,
    minHeight: 48,
    justifyContent: "center",
  },
  libraryBtnActive: {
    backgroundColor: "#00f2ff",
    borderColor: "#00f2ff",
  },
  libraryBtnText: {
    color: "#00f2ff",
    fontWeight: "800",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  libraryBtnTextActive: {
    color: "#000000",
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  genrePill: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreText: {
    color: "#bbbbbb",
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    color: "#cccccc",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  resContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  resBubble: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  resBubbleActive: {
    backgroundColor: "#00f2ff",
    borderColor: "#00f2ff",
  },
  resText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "800",
  },
  resTextActive: {
    color: "#000000",
  },
  streamList: {
    gap: 12,
  },
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
  streamEngine: {
    color: "#555555",
    fontSize: 11,
    fontWeight: "800",
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
  playIcon: {
    color: "#ffffff",
    fontSize: 24,
  },
  playIconDisabled: {
    color: "#333333",
  },
  streamActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  downloadIconBtn: {
    padding: 4,
  },
  emptyText: {
    color: "#555555",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 40,
  },
  sectionContent: {
    color: "#888888",
    fontSize: 14,
    lineHeight: 22,
  },
  seederBadge: {
    color: "#00ff88",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 4,
  },
});
