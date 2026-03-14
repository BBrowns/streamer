import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { hapticImpactLight, hapticSuccess } from "../../../lib/haptics";
import { useMeta } from "../../../hooks/useMeta";
import { useStreams } from "../../../hooks/useStreams";
import { usePlayerStore } from "../../../stores/playerStore";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorBoundary } from "../../../components/ui/ErrorBoundary";
import { downloadService } from "../../../services/DownloadService";
import type { Stream } from "@streamer/shared";

/**
 * Modern Media Detail Screen.
 * Fixed: Full stream object passed to player.
 * Restored: Download button for each stream.
 */
export default function DetailScreen() {
  const { type, id, autoplay } = useLocalSearchParams<{
    type: string;
    id: string;
    autoplay?: string;
  }>();
  const router = useRouter();
  const {
    data: meta,
    isLoading: metaLoading,
    error: metaError,
  } = useMeta(type, id);
  const { data: streams, isLoading: streamsLoading } = useStreams(type, id);
  const setStream = usePlayerStore((s) => s.setStream);
  const autoplayTriggered = useRef(false);

  const [selectedQuality, setSelectedQuality] = useState<string>("All");

  // Filter streams and get unique resolutions
  const { filteredStreams, resolutions } = useMemo(() => {
    if (!streams) return { filteredStreams: [], resolutions: ["All"] };

    const availableResolutions = [
      "All",
      ...new Set(
        streams
          .map((s) => s.resolution)
          .filter((r): r is string => !!r)
          .sort((a, b) => {
            const val = (s: string) => parseInt(s) || (s === "4K" ? 2160 : 0);
            return val(b) - val(a);
          }),
      ),
    ];

    const filtered =
      selectedQuality === "All"
        ? streams
        : streams.filter((s) => s.resolution === selectedQuality);

    return { filteredStreams: filtered, resolutions: availableResolutions };
  }, [streams, selectedQuality]);

  // Auto-play if requested
  useEffect(() => {
    if (
      autoplay === "true" &&
      !streamsLoading &&
      streams &&
      streams.length > 0 &&
      !autoplayTriggered.current
    ) {
      autoplayTriggered.current = true;
      handlePlay(streams[0]);
    }
  }, [autoplay, streamsLoading, streams]);

  if (metaLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#00f2ff" size="large" />
      </View>
    );
  }

  if (metaError || !meta) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorText}>Failed to load content</Text>
        <Pressable style={styles.retryButton} onPress={() => router.back()}>
          <Text style={styles.retryText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const handlePlay = (stream: Stream) => {
    hapticImpactLight();
    // Critical: Pass the FULL stream object so the player can resolve the engine (e.g. infoHash)
    setStream(stream, {
      type: meta.type as "movie" | "series",
      itemId: meta.id,
      title: meta.name,
      poster: meta.poster,
    });
    router.push("/player");
  };

  const handleDownload = (stream: Stream) => {
    hapticSuccess();
    downloadService.startDownload(stream, {
      type: meta.type as "movie" | "series",
      itemId: meta.id,
      title: meta.name,
      poster: meta.poster,
    });
    Alert.alert("Download Started", `Starting download for ${meta.name}`);
  };

  return (
    <ErrorBoundary>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView bounces={false} style={styles.container}>
        <View style={styles.heroContainer}>
          <Image source={{ uri: meta.background }} style={styles.background} />
          <LinearGradient
            colors={["transparent", "rgba(1,1,1,0.8)", "#010101"]}
            style={styles.gradient}
          />

          <Pressable style={styles.floatingBack} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>

          <View style={styles.headerContent}>
            <Image source={{ uri: meta.poster }} style={styles.poster} />
            <View style={styles.headerText}>
              <Text style={styles.title}>{meta.name}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.year}>{meta.releaseInfo}</Text>
                {!!meta.runtime && (
                  <Text style={styles.runtime}>{meta.runtime}</Text>
                )}
                {!!meta.imdbRating && (
                  <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={14} color="#ffd600" />
                    <Text style={styles.ratingText}>{meta.imdbRating}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.description}>{meta.description}</Text>

          <View style={styles.streamSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Streams</Text>
              <Text style={styles.streamCount}>
                {streams?.length || 0} Total
              </Text>
            </View>

            {resolutions.length > 2 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.filterContainer}
              >
                {resolutions.map((res) => (
                  <Pressable
                    key={res}
                    style={[
                      styles.filterChip,
                      selectedQuality === res && styles.filterChipActive,
                    ]}
                    onPress={() => setSelectedQuality(res)}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        selectedQuality === res && styles.filterTextActive,
                      ]}
                    >
                      {res}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {streamsLoading ? (
              <ActivityIndicator color="#00f2ff" style={{ marginTop: 20 }} />
            ) : filteredStreams.length > 0 ? (
              filteredStreams.map((stream, idx) => (
                <View key={idx} style={styles.streamCard}>
                  <Pressable
                    style={styles.streamInfo}
                    onPress={() => handlePlay(stream)}
                  >
                    <View style={styles.streamHeader}>
                      <Text style={styles.streamTitle} numberOfLines={2}>
                        {stream.title}
                      </Text>
                      {stream.resolution && (
                        <View style={styles.qualityTag}>
                          <Text style={styles.qualityTagText}>
                            {stream.resolution}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.streamName}>{stream.name}</Text>
                    {stream.seeders !== undefined && (
                      <View style={styles.peerRow}>
                        <Ionicons
                          name="people-outline"
                          size={12}
                          color="#a1a1aa"
                        />
                        <Text style={styles.peerText}>
                          {stream.seeders} Seeders
                        </Text>
                      </View>
                    )}
                  </Pressable>

                  <View style={styles.streamActions}>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => handleDownload(stream)}
                      accessibilityLabel="Download stream"
                    >
                      <Ionicons
                        name="download-outline"
                        size={22}
                        color="#94a3b8"
                      />
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, styles.playButton]}
                      onPress={() => handlePlay(stream)}
                      accessibilityLabel="Play stream"
                    >
                      <Ionicons name="play" size={24} color="#00f2ff" />
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <EmptyState
                icon="close-circle-outline"
                title="No streams found"
                description={
                  selectedQuality !== "All"
                    ? `No ${selectedQuality} streams available.`
                    : "Unable to find any streams for this content."
                }
                actionLabel={
                  selectedQuality !== "All" ? "Clear Filters" : undefined
                }
                onAction={
                  selectedQuality !== "All"
                    ? () => setSelectedQuality("All")
                    : undefined
                }
              />
            )}
          </View>
        </View>
      </ScrollView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#010101" },
  centered: {
    flex: 1,
    backgroundColor: "#010101",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 18,
    marginTop: 16,
    fontWeight: "700",
  },
  retryButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  retryText: { color: "#fff", fontWeight: "600" },
  heroContainer: { height: 450, position: "relative" },
  background: { width: "100%", height: "100%", resizeMode: "cover" },
  gradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 250 },
  floatingBack: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  headerContent: {
    position: "absolute",
    bottom: 0,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  poster: {
    width: 110,
    height: 165,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
  },
  headerText: { flex: 1, marginLeft: 16, marginBottom: 8 },
  title: { color: "#fff", fontSize: 32, fontWeight: "900", letterSpacing: -1 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 12,
  },
  year: { color: "#94a3b8", fontWeight: "600" },
  runtime: { color: "#94a3b8", fontWeight: "600" },
  ratingContainer: { flexDirection: "row", alignItems: "center" },
  ratingText: {
    color: "#ffd600",
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 4,
  },
  body: { padding: 24 },
  description: { color: "#cbd5e1", fontSize: 16, lineHeight: 24 },
  streamSection: { marginTop: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 16,
  },
  sectionTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  streamCount: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  filterScroll: { marginBottom: 16 },
  filterContainer: { gap: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  filterChipActive: {
    backgroundColor: "#00f2ff",
    borderColor: "#00f2ff",
  },
  filterText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "700",
  },
  filterTextActive: {
    color: "#010101",
  },
  streamCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#080808",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  streamInfo: { flex: 1 },
  streamHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  streamTitle: { color: "#f8fafc", fontSize: 15, fontWeight: "700", flex: 1 },
  streamName: { color: "#94a3b8", fontSize: 12, lineHeight: 18 },
  qualityTag: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  qualityTagText: {
    color: "#00f2ff",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  peerRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  peerText: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 4,
  },
  streamActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginLeft: 16,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
  },
});
