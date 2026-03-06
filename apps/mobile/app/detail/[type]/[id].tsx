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
import { useCallback, useState, useEffect } from "react";

const { height } = Dimensions.get("window");
const BACKDROP_HEIGHT = height * 0.55;

function StreamItem({
  stream,
  index,
  onPress,
}: {
  stream: Stream;
  index: number;
  onPress: () => void;
}) {
  const [playable, setPlayable] = useState(false);
  const engine = streamEngineManager.resolveEngine(stream);

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
          {!playable && (
            <View style={styles.torrentBadge}>
              <Text style={styles.torrentBadgeText}>🧲 Torrent · Bridge</Text>
            </View>
          )}
          {playable && (
            <View style={styles.playableBadge}>
              <Text style={styles.playableBadgeText}>✓ Playable</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.playIcon, !playable && styles.playIconDisabled]}>
        {playable ? "▶" : "🔒"}
      </Text>
    </Pressable>
  );
}

export default function DetailScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const router = useRouter();
  const { data: meta, isLoading: metaLoading } = useMeta(type, id);
  const { data: streams, isLoading: streamsLoading } = useStreams(type, id);
  const setStream = usePlayerStore((s) => s.setStream);

  // Library state
  const { data: inLibrary } = useIsInLibrary(id);
  const addToLibrary = useAddToLibrary();
  const removeFromLibrary = useRemoveFromLibrary();

  const handleToggleLibrary = useCallback(() => {
    if (!meta) return;
    hapticImpactLight();
    if (inLibrary) {
      removeFromLibrary.mutate(id);
    } else {
      hapticSuccess();
      addToLibrary.mutate({
        type: type as "movie" | "series",
        itemId: id,
        title: meta.name,
        poster: meta.poster,
      });
    }
  }, [meta, inLibrary, id, type, addToLibrary, removeFromLibrary]);

  const handlePlayStream = async (stream: Stream) => {
    const uri = await streamEngineManager.getPlaybackUri(stream);
    const playable = !!uri && uri.length > 0;

    // For torrent streams, re-probe bridge if not currently "playable" via debrid or existing bridge
    if (!playable && stream.infoHash) {
      const bridgeUp = await streamEngineManager.detectBridge();
      if (bridgeUp) {
        // Bridge just came online — retry resolution
        const retryUri = await streamEngineManager.getPlaybackUri(stream);
        if (retryUri && retryUri.length > 0) {
          const mediaInfo: MediaInfo = {
            type: (type as "movie" | "series") ?? "movie",
            itemId: id,
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
        ? "This is a torrent stream. Start the stream-server daemon first:\n\nnpm run dev:stream-server\n\nAlternatively, enable Real-Debrid in your settings if available."
        : "This stream does not provide a direct playable URL. It may require additional resolution.";

      if (Platform.OS === "web") {
        window.alert(`Unsupported Stream\n\n${msg}`);
      } else {
        Alert.alert("Unsupported Stream", msg);
      }
      return;
    }

    // Build MediaInfo for server progress reporting
    const mediaInfo: MediaInfo = {
      type: (type as "movie" | "series") ?? "movie",
      itemId: id,
      title: meta?.name ?? stream.title ?? "Unknown",
      poster: meta?.poster,
    };

    setStream(stream, mediaInfo);
    router.push("/player");
  };

  if (metaLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#818cf8" />
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
            colors={["transparent", "rgba(0,0,0,0.8)", "#000000"]}
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
            accessibilityRole="button"
            accessibilityLabel={
              inLibrary ? "Remove from library" : "Add to library"
            }
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

          {/* Streams */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎬 Available Streams</Text>

            {streamsLoading ? (
              <ActivityIndicator color="#818cf8" />
            ) : !!streams && streams.length > 0 ? (
              streams.map((stream, i) => {
                return (
                  <StreamItem
                    key={i}
                    stream={stream}
                    index={i}
                    onPress={() => handlePlayStream(stream)}
                  />
                );
              })
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
    backgroundColor: "#000000",
  },
  centered: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#f87171",
  },
  floatingBack: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20, // Rough safe area estimate
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroContainer: {
    width: "100%",
    height: BACKDROP_HEIGHT,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0a0a0a",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  content: {
    padding: 20,
    marginTop: -80, // Pull up into the gradient
    zIndex: 2,
    minHeight: height * 0.6, // Ensure enough height to scroll nicely
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaTag: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingTag: {
    color: "#fbbf24",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(251,191,36,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  // Library button
  libraryBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
    marginBottom: 24,
    minHeight: 44,
    justifyContent: "center",
  },
  libraryBtnActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
  },
  libraryBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
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
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreText: {
    color: "#e5e5e5",
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    color: "#d4d4d8",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 28,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 12,
  },
  sectionContent: {
    color: "#a1a1aa",
    fontSize: 14,
    lineHeight: 22,
  },
  streamCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0a0a0a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    minHeight: 50,
  },
  streamCardDisabled: {
    opacity: 0.5,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  streamTitle: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  streamBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  streamEngine: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "700",
  },
  torrentBadge: {
    backgroundColor: "rgba(251, 146, 60, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  torrentBadgeText: {
    color: "#fb923c",
    fontSize: 10,
    fontWeight: "800",
  },
  playableBadge: {
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  playableBadgeText: {
    color: "#4ade80",
    fontSize: 10,
    fontWeight: "800",
  },
  playIcon: {
    color: "#ffffff",
    fontSize: 22,
    marginLeft: 12,
  },
  playIconDisabled: {
    color: "#52525b",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },
});
