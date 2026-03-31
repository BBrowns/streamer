import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { memo, useState, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { VideoEntry, Stream } from "@streamer/shared";
import { hapticImpactLight } from "../../lib/haptics";
import { useEpisodeStreams } from "../../hooks/useEpisodeStreams";
import { StreamItem } from "../detail/StreamItem";

// ─── Episode Row ────────────────────────────────────────────────────────────

function EpisodeRow({
  video,
  isSelected,
  onPress,
}: {
  video: VideoEntry;
  isSelected: boolean;
  onPress: () => void;
}) {
  const releasedDate = video.released
    ? new Date(video.released).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Pressable
      style={[styles.episodeRow, isSelected && styles.episodeRowActive]}
      onPress={() => {
        hapticImpactLight();
        onPress();
      }}
    >
      <View style={[styles.epNumBadge, isSelected && styles.epNumBadgeActive]}>
        <Text style={[styles.epNum, isSelected && styles.epNumActive]}>
          {video.episode}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.epTitle, isSelected && styles.epTitleActive]}
          numberOfLines={2}
        >
          {video.title}
        </Text>
        {releasedDate && <Text style={styles.epDate}>{releasedDate}</Text>}
      </View>
      {isSelected && (
        <Ionicons name="chevron-forward" size={16} color="#00f2ff" />
      )}
    </Pressable>
  );
}

// ─── Stream List for a selected episode ────────────────────────────────────

function EpisodeStreamList({
  seriesId,
  season,
  episode,
  episodeTitle,
  onPlayStream,
  onDownloadStream,
}: {
  seriesId: string;
  season: number;
  episode: number;
  episodeTitle: string;
  onPlayStream: (stream: Stream, episodeTitle: string) => void;
  onDownloadStream: (stream: Stream, episodeTitle: string) => void;
}) {
  const { data: streams, isLoading } = useEpisodeStreams(
    seriesId,
    season,
    episode,
  );

  if (isLoading) {
    return (
      <View style={styles.streamLoading}>
        <ActivityIndicator color="#00f2ff" size="small" />
        <Text style={styles.streamLoadingText}>Loading streams…</Text>
      </View>
    );
  }

  if (!streams || streams.length === 0) {
    return (
      <View style={styles.noStreams}>
        <Ionicons name="warning-outline" size={20} color="#52525b" />
        <Text style={styles.noStreamsText}>No streams for this episode.</Text>
      </View>
    );
  }

  return (
    <View style={styles.streamPanel}>
      <Text style={styles.streamPanelLabel}>
        S{season} E{episode} — Streams
      </Text>
      {streams.map((stream, i) => {
        const key = `${stream.infoHash || stream.url || "stream"}-${i}`;
        return (
          <StreamItem
            key={key}
            stream={stream}
            index={i}
            onPress={() => onPlayStream(stream, episodeTitle)}
            onDownload={() => onDownloadStream(stream, episodeTitle)}
          />
        );
      })}
    </View>
  );
}

// ─── Main EpisodeSelector Component ─────────────────────────────────────────

interface EpisodeSelectorProps {
  seriesId: string;
  videos: VideoEntry[];
  onPlayStream: (
    stream: Stream,
    episodeTitle: string,
    season: number,
    episode: number,
  ) => void;
  onDownloadStream: (
    stream: Stream,
    episodeTitle: string,
    season: number,
    episode: number,
  ) => void;
}

export const EpisodeSelector = memo(function EpisodeSelector({
  seriesId,
  videos,
  onPlayStream,
  onDownloadStream,
}: EpisodeSelectorProps) {
  // Group videos by season
  const seasons = useMemo(() => {
    const map = new Map<number, VideoEntry[]>();
    for (const v of videos) {
      if (!map.has(v.season)) map.set(v.season, []);
      map.get(v.season)!.push(v);
    }
    // Sort episodes within each season
    for (const [, eps] of map) {
      eps.sort((a, b) => a.episode - b.episode);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [videos]);

  const firstSeason = seasons[0]?.[0] ?? null;
  const [selectedSeason, setSelectedSeason] = useState<number>(
    firstSeason ?? 1,
  );
  const [selectedEpisode, setSelectedEpisode] = useState<VideoEntry | null>(
    null,
  );

  const episodesInSeason = useMemo(
    () => seasons.find(([s]) => s === selectedSeason)?.[1] ?? [],
    [seasons, selectedSeason],
  );

  const handleSeasonChange = (season: number) => {
    hapticImpactLight();
    setSelectedSeason(season);
    setSelectedEpisode(null);
  };

  if (seasons.length === 0) {
    return (
      <View style={styles.noStreams}>
        <Text style={styles.noStreamsText}>No episode data available.</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Season Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.seasonTabRow}
      >
        {seasons.map(([season]) => (
          <Pressable
            key={season}
            style={[
              styles.seasonTab,
              selectedSeason === season && styles.seasonTabActive,
            ]}
            onPress={() => handleSeasonChange(season)}
          >
            <Text
              style={[
                styles.seasonTabText,
                selectedSeason === season && styles.seasonTabTextActive,
              ]}
            >
              Season {season}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Episode List */}
      <View style={styles.episodeList}>
        {episodesInSeason.map((video) => (
          <EpisodeRow
            key={video.id}
            video={video}
            isSelected={selectedEpisode?.id === video.id}
            onPress={() =>
              setSelectedEpisode(
                selectedEpisode?.id === video.id ? null : video,
              )
            }
          />
        ))}
      </View>

      {/* Stream panel expands below selected episode */}
      {selectedEpisode && (
        <EpisodeStreamList
          seriesId={seriesId}
          season={selectedEpisode.season}
          episode={selectedEpisode.episode}
          episodeTitle={selectedEpisode.title}
          onPlayStream={(stream, title) =>
            onPlayStream(
              stream,
              title,
              selectedEpisode.season,
              selectedEpisode.episode,
            )
          }
          onDownloadStream={(stream, title) =>
            onDownloadStream(
              stream,
              title,
              selectedEpisode.season,
              selectedEpisode.episode,
            )
          }
        />
      )}
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  seasonTabRow: {
    paddingHorizontal: 0,
    gap: 8,
    paddingBottom: 12,
    flexDirection: "row",
  },
  seasonTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  seasonTabActive: {
    backgroundColor: "#00f2ff",
    borderColor: "#00f2ff",
  },
  seasonTabText: {
    color: "#71717a",
    fontSize: 13,
    fontWeight: "700",
  },
  seasonTabTextActive: {
    color: "#000000",
  },
  episodeList: {
    gap: 4,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  episodeRowActive: {
    backgroundColor: "rgba(0,242,255,0.07)",
    borderColor: "rgba(0,242,255,0.25)",
  },
  epNumBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  epNumBadgeActive: {
    backgroundColor: "rgba(0,242,255,0.2)",
  },
  epNum: {
    color: "#71717a",
    fontSize: 13,
    fontWeight: "800",
  },
  epNumActive: {
    color: "#00f2ff",
  },
  epTitle: {
    color: "#d4d4d8",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  epTitleActive: {
    color: "#ffffff",
  },
  epDate: {
    color: "#52525b",
    fontSize: 11,
    marginTop: 2,
  },
  streamLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  streamLoadingText: {
    color: "#71717a",
    fontSize: 14,
  },
  noStreams: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  noStreamsText: {
    color: "#52525b",
    fontSize: 14,
  },
  streamPanel: {
    marginTop: 12,
    gap: 8,
  },
  streamPanelLabel: {
    color: "#00f2ff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    paddingLeft: 4,
  },
});
