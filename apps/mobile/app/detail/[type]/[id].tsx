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
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
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
import { useCallback } from "react";

/** Check if a stream is directly playable (has a real HTTP(S) URL) */
function isPlayable(stream: Stream): boolean {
  const uri = streamEngineManager.getPlaybackUri(stream);
  return !!uri && uri.length > 0;
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
    if (inLibrary) {
      removeFromLibrary.mutate(id);
    } else {
      addToLibrary.mutate({
        type: type as "movie" | "series",
        itemId: id,
        title: meta.name,
        poster: meta.poster,
      });
    }
  }, [meta, inLibrary, id, type, addToLibrary, removeFromLibrary]);

  const handlePlayStream = async (stream: Stream) => {
    // For torrent streams, re-probe bridge before blocking
    if (!isPlayable(stream) && stream.infoHash) {
      const bridgeUp = await streamEngineManager.detectBridge();
      if (bridgeUp) {
        // Bridge just came online — now playable
        const uri = streamEngineManager.getPlaybackUri(stream);
        if (uri && uri.length > 0) {
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

    if (!isPlayable(stream)) {
      const msg = stream.infoHash
        ? "This is a torrent stream. Start the stream-server daemon first:\n\nnpm run dev:stream-server"
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
    <>
      <Stack.Screen options={{ title: meta.name }} />
      <ScrollView style={styles.container}>
        {/* Hero Image */}
        {!!meta.background && (
          <Image source={{ uri: meta.background }} style={styles.backdrop} />
        )}
        {!meta.background && !!meta.poster && (
          <Image source={{ uri: meta.poster }} style={styles.backdrop} />
        )}

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
                const engine = streamEngineManager.resolveEngine(stream);
                const playable = isPlayable(stream);

                return (
                  <Pressable
                    key={i}
                    style={[
                      styles.streamCard,
                      !playable && styles.streamCardDisabled,
                    ]}
                    onPress={() => handlePlayStream(stream)}
                    accessibilityRole="button"
                    accessibilityLabel={`${playable ? "Play" : "Torrent"} stream: ${stream.title || stream.name || `Stream ${i + 1}`}`}
                    accessibilityHint={
                      playable
                        ? "Opens the video player"
                        : "Requires the stream-server bridge"
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.streamTitle}>
                        {stream.title || stream.name || `Stream ${i + 1}`}
                      </Text>
                      <View style={styles.streamBadgeRow}>
                        <Text style={styles.streamEngine}>
                          {engine?.getEngineType().toUpperCase() || "UNKNOWN"}
                        </Text>
                        {!playable && (
                          <View style={styles.torrentBadge}>
                            <Text style={styles.torrentBadgeText}>
                              🧲 Torrent · Bridge
                            </Text>
                          </View>
                        )}
                        {playable && (
                          <View style={styles.playableBadge}>
                            <Text style={styles.playableBadgeText}>
                              ✓ Playable
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.playIcon,
                        !playable && styles.playIconDisabled,
                      ]}
                    >
                      {playable ? "▶" : "🔒"}
                    </Text>
                  </Pressable>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
  },
  centered: {
    flex: 1,
    backgroundColor: "#0a0a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#f87171",
  },
  backdrop: {
    width: "100%",
    height: 240,
    backgroundColor: "#1a1a3e",
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#e0e0ff",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaTag: {
    color: "#9ca3af",
    fontSize: 13,
    backgroundColor: "#1a1a3e",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingTag: {
    color: "#fbbf24",
    fontSize: 13,
    backgroundColor: "#1a1a3e",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  // Library button
  libraryBtn: {
    backgroundColor: "rgba(129, 140, 248, 0.12)",
    borderWidth: 1,
    borderColor: "#818cf8",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: "flex-start",
    marginBottom: 16,
    minHeight: 44,
    justifyContent: "center",
  },
  libraryBtnActive: {
    backgroundColor: "#818cf8",
  },
  libraryBtnText: {
    color: "#818cf8",
    fontWeight: "700",
    fontSize: 14,
  },
  libraryBtnTextActive: {
    color: "#fff",
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  genrePill: {
    backgroundColor: "rgba(129, 140, 248, 0.15)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  genreText: {
    color: "#818cf8",
    fontSize: 11,
    fontWeight: "600",
  },
  description: {
    color: "#d1d5db",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#e0e0ff",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 8,
  },
  sectionContent: {
    color: "#9ca3af",
    fontSize: 13,
    lineHeight: 20,
  },
  streamCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a3e",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.1)",
    minHeight: 44,
  },
  streamCardDisabled: {
    opacity: 0.55,
    borderColor: "rgba(107, 114, 128, 0.2)",
  },
  streamTitle: {
    color: "#e0e0ff",
    fontWeight: "600",
    fontSize: 14,
  },
  streamBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  streamEngine: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "600",
  },
  torrentBadge: {
    backgroundColor: "rgba(251, 146, 60, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  torrentBadgeText: {
    color: "#fb923c",
    fontSize: 9,
    fontWeight: "700",
  },
  playableBadge: {
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  playableBadgeText: {
    color: "#4ade80",
    fontSize: 9,
    fontWeight: "700",
  },
  playIcon: {
    color: "#818cf8",
    fontSize: 20,
    marginLeft: 12,
  },
  playIconDisabled: {
    color: "#6b7280",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },
});
