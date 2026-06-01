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
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import { StreamItem } from "../detail/StreamItem";

// ─── Episode Row ────────────────────────────────────────────────────────────

function EpisodeRow({
  video,
  isSelected,
  onPress,
  onDownload,
  onToggleSources,
}: {
  video: VideoEntry;
  isSelected: boolean;
  onPress: () => void;
  onDownload: () => void;
  onToggleSources: () => void;
}) {
  const { colors, isDark } = useTheme();

  const releasedDate = video.released
    ? new Date(video.released).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <View
      style={[
        styles.episodeRow,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.03)"
            : "rgba(0,0,0,0.02)",
          borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
        },
        isSelected && {
          backgroundColor: isDark
            ? "rgba(216,180,254,0.12)"
            : "rgba(167,139,250,0.12)",
          borderColor: isDark
            ? "rgba(216,180,254,0.32)"
            : "rgba(167,139,250,0.32)",
        },
      ]}
    >
      <Pressable
        style={styles.episodePlayArea}
        onPress={() => {
          hapticImpactLight();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Play episode ${video.episode}: ${video.title}`}
      >
        <View
          style={[
            styles.epNumBadge,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
            },
            isSelected && {
              backgroundColor: isDark
                ? "rgba(216,180,254,0.2)"
                : "rgba(167,139,250,0.16)",
            },
          ]}
        >
          <Text
            style={[
              styles.epNum,
              { color: colors.textSecondary },
              isSelected && { color: colors.tint },
            ]}
          >
            {video.episode}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.epTitle,
              { color: colors.textSecondary },
              isSelected && { color: colors.text },
            ]}
            numberOfLines={2}
          >
            {video.title}
          </Text>
          {releasedDate && (
            <Text
              style={[
                styles.epDate,
                { color: colors.textSecondary, opacity: 0.7 },
              ]}
            >
              {releasedDate}
            </Text>
          )}
        </View>
      </Pressable>
      <View style={styles.episodeActions}>
        <Pressable
          style={styles.episodeIconButton}
          onPress={() => {
            hapticImpactLight();
            onDownload();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Download episode ${video.episode}: ${video.title}`}
        >
          <Ionicons
            name="download-outline"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
        <Pressable
          style={[
            styles.episodeIconButton,
            isSelected && {
              backgroundColor: isDark
                ? "rgba(216,180,254,0.2)"
                : "rgba(167,139,250,0.16)",
            },
          ]}
          onPress={() => {
            hapticImpactLight();
            onToggleSources();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Advanced sources for episode ${video.episode}: ${video.title}`}
        >
          <Ionicons
            name={isSelected ? "chevron-up" : "ellipsis-horizontal"}
            size={18}
            color={isSelected ? colors.tint : colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
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
  const { colors } = useTheme();
  const { t } = useTranslation();

  const { data: streams, isLoading } = useEpisodeStreams(
    seriesId,
    season,
    episode,
  );

  if (isLoading) {
    return (
      <View style={styles.streamLoading}>
        <ActivityIndicator color={colors.tint} size="small" />
        <Text
          style={[styles.streamLoadingText, { color: colors.textSecondary }]}
        >
          {t("detail.episodesList.loading")}
        </Text>
      </View>
    );
  }

  if (!streams || streams.length === 0) {
    return (
      <View style={styles.noStreams}>
        <Ionicons
          name="warning-outline"
          size={20}
          color={colors.textSecondary}
        />
        <Text style={[styles.noStreamsText, { color: colors.textSecondary }]}>
          {t("detail.episodesList.none")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.streamPanel}>
      <Text style={[styles.streamPanelLabel, { color: colors.tint }]}>
        Advanced sources ·{" "}
        {t("detail.episodesList.streamsLabel", { season, episode })}
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
    stream: Stream | undefined,
    episodeTitle: string,
    season: number,
    episode: number,
  ) => void;
  onDownloadStream: (
    stream: Stream | undefined,
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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  // Simple helper for button text contrast
  function takesInverseColor(hex: string) {
    return isDark ? "#000000" : "#ffffff";
  }

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
        <Text style={[styles.noStreamsText, { color: colors.textSecondary }]}>
          {t("detail.episodesList.noneData")}
        </Text>
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
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(0,0,0,0.05)",
                borderColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.08)",
              },
              selectedSeason === season && {
                backgroundColor: colors.tint,
                borderColor: colors.tint,
              },
            ]}
            onPress={() => handleSeasonChange(season)}
          >
            <Text
              style={[
                styles.seasonTabText,
                { color: colors.textSecondary },
                selectedSeason === season && {
                  color: takesInverseColor(colors.tint),
                },
              ]}
            >
              {t("detail.episodesList.season", { season })}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Episode List */}
      <View style={styles.episodeList}>
        {episodesInSeason.map((video) => (
          <View key={video.id} style={styles.episodeBlock}>
            <EpisodeRow
              video={video}
              isSelected={selectedEpisode?.id === video.id}
              onPress={() =>
                onPlayStream(
                  undefined,
                  video.title,
                  video.season,
                  video.episode,
                )
              }
              onDownload={() =>
                onDownloadStream(
                  undefined,
                  video.title,
                  video.season,
                  video.episode,
                )
              }
              onToggleSources={() =>
                setSelectedEpisode(
                  selectedEpisode?.id === video.id ? null : video,
                )
              }
            />
            {selectedEpisode?.id === video.id && (
              <EpisodeStreamList
                seriesId={seriesId}
                season={video.season}
                episode={video.episode}
                episodeTitle={video.title}
                onPlayStream={(stream, title) =>
                  onPlayStream(stream, title, video.season, video.episode)
                }
                onDownloadStream={(stream, title) =>
                  onDownloadStream(stream, title, video.season, video.episode)
                }
              />
            )}
          </View>
        ))}
      </View>
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
    borderWidth: 1,
  },
  seasonTabActive: {},
  seasonTabText: {
    fontSize: 13,
    fontWeight: "700",
  },
  seasonTabTextActive: {},
  episodeList: {
    gap: 10,
  },
  episodeBlock: {
    gap: 8,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  episodeRowActive: {},
  episodePlayArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  epNumBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  epNumBadgeActive: {},
  epNum: {
    fontSize: 13,
    fontWeight: "800",
  },
  epNumActive: {},
  epTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  epTitleActive: {},
  epDate: {
    fontSize: 11,
    marginTop: 2,
  },
  episodeAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  episodeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  episodeIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  episodeActionText: {
    fontSize: 11,
    fontWeight: "900",
  },
  streamLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  streamLoadingText: {
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
    fontSize: 14,
  },
  streamPanel: {
    marginTop: 0,
    marginLeft: 48,
    gap: 8,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  streamPanelLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0,
    marginBottom: 4,
    paddingLeft: 4,
  },
});
