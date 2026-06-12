import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { hapticImpactLight } from "../../lib/haptics";
import type { DetailLayoutProps } from "./types";
import { StreamItem } from "./StreamItem";
import { EpisodeSelector } from "../catalog/EpisodeSelector";
import { FlashList } from "@shopify/flash-list";
import { useTheme } from "../../hooks/useTheme";
import { PlaybackReadinessNotice } from "./PlaybackReadinessNotice";
import { DetailActionPanel } from "./DetailActionPanel";
import { SourceInspectorPanel } from "./SourceInspectorPanel";

export function DesktopDetailLayout({
  id,
  castType,
  meta,
  streams,
  streamsLoading,
  groupedStreams,
  availableResolutions,
  selectedResolution,
  setSelectedResolution,
  inLibrary,
  handleToggleLibrary,
  handlePlayStream,
  handleDownloadStream,
  handleCastStream,
  planningAction,
  playbackNotice,
  onDismissPlaybackNotice,
  onOpenSourcesDevices,
  onBack,
}: DetailLayoutProps) {
  const { colors, isDark } = useTheme();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const selectedStreams =
    castType === "series" ? [] : groupedStreams[selectedResolution!] || [];
  const streamsData =
    castType === "series" || !sourcesOpen ? [] : selectedStreams;
  const hasMovieSources = castType !== "series" && (streams?.length ?? 0) > 0;
  const sourceCount =
    castType === "series" ? meta.videos?.length || 0 : streams?.length || 0;
  const primaryTextColor = isDark ? "#2c1738" : "#ffffff";
  const surfaceColor = isDark ? "rgba(255,255,255,0.07)" : colors.card;
  const softSurfaceColor = isDark
    ? "rgba(255,255,255,0.08)"
    : "rgba(255,255,255,0.58)";
  const warningSurface = isDark
    ? "rgba(255,217,168,0.08)"
    : "rgba(255,217,168,0.22)";

  const renderHeader = () => (
    <View style={styles.headerShell}>
      <View style={styles.eyebrowRow}>
        <View style={[styles.eyebrowPill, { backgroundColor: colors.tint }]}>
          <Ionicons
            name={castType === "series" ? "albums-outline" : "film-outline"}
            size={15}
            color={primaryTextColor}
          />
          <Text style={[styles.eyebrowText, { color: primaryTextColor }]}>
            {castType === "series" ? "Series" : "Movie"}
          </Text>
        </View>
        <Text style={[styles.sourceCountText, { color: colors.textSecondary }]}>
          {castType === "series"
            ? `${sourceCount} episodes`
            : `${sourceCount} sources`}
        </Text>
      </View>

      <Text style={[styles.desktopTitle, { color: colors.text }]}>
        {meta.name}
      </Text>

      <View style={styles.metaRow}>
        {!!meta.releaseInfo && (
          <Text
            style={[
              styles.metaTag,
              {
                color: colors.textSecondary,
                backgroundColor: softSurfaceColor,
              },
            ]}
          >
            {meta.releaseInfo}
          </Text>
        )}
        {!!meta.runtime && (
          <Text
            style={[
              styles.metaTag,
              {
                color: colors.textSecondary,
                backgroundColor: softSurfaceColor,
              },
            ]}
          >
            {meta.runtime}
          </Text>
        )}
        {!!meta.imdbRating && (
          <Text style={styles.ratingTag}>⭐ {meta.imdbRating}</Text>
        )}
      </View>

      {!!meta.genres && meta.genres.length > 0 && (
        <View style={styles.genreRow}>
          {meta.genres.map((g: string, idx: number) => (
            <View
              key={`${g}-${idx}`}
              style={[
                styles.genrePill,
                {
                  backgroundColor: softSurfaceColor,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.genreText, { color: colors.textSecondary }]}>
                {g}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!!meta.description && (
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {meta.description}
        </Text>
      )}

      <DetailActionPanel
        castType={castType}
        sourceCount={sourceCount}
        episodeCount={meta.videos?.length || 0}
        streamsLoading={streamsLoading}
        hasPlayableSources={hasMovieSources}
        inLibrary={!!inLibrary}
        planningAction={planningAction}
        onPlayBest={() => handlePlayStream()}
        onDownload={() => handleDownloadStream()}
        onCast={handleCastStream ? () => handleCastStream() : undefined}
        onToggleLibrary={handleToggleLibrary}
        style={styles.detailActionPanel}
      />

      {!!playbackNotice && !!onDismissPlaybackNotice && (
        <PlaybackReadinessNotice
          notice={playbackNotice}
          onDismiss={onDismissPlaybackNotice}
          onPrimaryAction={onOpenSourcesDevices}
        />
      )}

      {!!meta.cast && meta.cast.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Cast
          </Text>
          <Text
            style={[styles.sectionContent, { color: colors.textSecondary }]}
          >
            {meta.cast.join(", ")}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.sectionSurface,
          { backgroundColor: surfaceColor, borderColor: colors.border },
        ]}
      >
        {castType === "series" ? (
          <>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="list" size={18} color={colors.tint} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Episodes
              </Text>
            </View>
            <EpisodeSelector
              seriesId={id}
              videos={meta.videos || []}
              onPlayStream={handlePlayStream}
              onDownloadStream={handleDownloadStream}
            />
          </>
        ) : (
          <>
            <Pressable
              style={styles.sourceDisclosureHeader}
              onPress={() => {
                hapticImpactLight();
                setSourcesOpen((value) => !value);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                sourcesOpen ? "Hide more sources" : "Show more sources"
              }
            >
              <View style={styles.sectionTitleRowCompact}>
                <Ionicons name="layers-outline" size={18} color={colors.tint} />
                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      styles.sectionTitleCompact,
                      { color: colors.text },
                    ]}
                  >
                    More Sources
                  </Text>
                  <Text
                    style={[
                      styles.sourceDisclosureMeta,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Advanced fallback · {sourceCount} available
                  </Text>
                </View>
              </View>
              <Ionicons
                name={sourcesOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>

            {sourcesOpen && streamsLoading ? (
              <ActivityIndicator color="#d8b4fe" />
            ) : sourcesOpen && availableResolutions.length > 0 ? (
              <>
                <SourceInspectorPanel
                  contentType={castType}
                  contentId={id}
                  title={meta.name}
                />
                <View style={styles.resContainer}>
                  {availableResolutions.map((res) => (
                    <Pressable
                      key={res}
                      style={[
                        styles.resBubble,
                        {
                          backgroundColor: softSurfaceColor,
                          borderColor: colors.border,
                        },
                        selectedResolution === res && {
                          backgroundColor: colors.tint,
                          borderColor: colors.tint,
                        },
                      ]}
                      onPress={() => {
                        hapticImpactLight();
                        setSelectedResolution(res);
                      }}
                    >
                      <Text
                        style={[
                          styles.resText,
                          { color: colors.textSecondary },
                          selectedResolution === res && {
                            color: primaryTextColor,
                          },
                        ]}
                      >
                        {res === "2160p" ? "4K" : res.toUpperCase()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : sourcesOpen ? (
              <>
                <SourceInspectorPanel
                  contentType={castType}
                  contentId={id}
                  title={meta.name}
                />
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  No streams available. Install more add-ons.
                </Text>
              </>
            ) : null}
          </>
        )}
      </View>
    </View>
  );

  return (
    <View
      style={[styles.containerDesktop, { backgroundColor: colors.background }]}
    >
      {!!meta.background && (
        <Image
          source={{ uri: meta.background }}
          style={styles.ambientBackdrop}
          resizeMode="cover"
        />
      )}
      <View
        style={[
          styles.ambientOverlay,
          {
            backgroundColor: isDark
              ? "rgba(17,18,28,0.82)"
              : "rgba(251,246,244,0.88)",
          },
        ]}
      />

      <View
        style={[
          styles.desktopPosterPanel,
          { backgroundColor: colors.tabBar, borderRightColor: colors.border },
        ]}
      >
        <Pressable style={styles.desktopBackBtn} onPress={onBack}>
          <Ionicons
            name="chevron-back"
            size={20}
            color={colors.textSecondary}
          />
          <Text
            style={[styles.desktopBackText, { color: colors.textSecondary }]}
          >
            Back
          </Text>
        </Pressable>
        <View style={[styles.posterFrame, { borderColor: colors.border }]}>
          {!!meta.poster ? (
            <Image
              source={{ uri: meta.poster }}
              style={styles.desktopPoster}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons name="film-outline" size={44} color={colors.tint} />
            </View>
          )}
        </View>
        <View
          style={[
            styles.deviceHintCard,
            {
              borderColor: colors.warning + "55",
              backgroundColor: warningSurface,
            },
          ]}
        >
          <Ionicons name="sparkles-outline" size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.deviceHintTitle, { color: colors.text }]}>
              Cinema mode
            </Text>
            <Text
              style={[styles.deviceHintText, { color: colors.textSecondary }]}
            >
              Sources stay quiet until you choose play, download, or cast.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.desktopInfoPanel}>
        <FlashList
          data={streamsData}
          ListHeaderComponent={renderHeader}
          renderItem={({ item: stream, index: i }) => (
            <View style={styles.streamListWrapper}>
              <StreamItem
                stream={stream}
                index={i}
                onPress={() => handlePlayStream(stream)}
                onDownload={() => handleDownloadStream(stream)}
              />
            </View>
          )}
          contentContainerStyle={styles.desktopScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  containerDesktop: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#11121c",
    overflow: "hidden",
    position: "relative",
  },
  ambientBackdrop: {
    position: "absolute",
    top: -90,
    right: -80,
    width: "72%",
    height: "78%",
    opacity: 0.18,
  },
  ambientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17,18,28,0.82)",
  },
  desktopPosterPanel: {
    width: 340,
    backgroundColor: "rgba(255,255,255,0.075)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.14)",
    padding: 28,
    paddingTop: 24,
    zIndex: 2,
  },
  desktopBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 28,
    alignSelf: "flex-start",
  },
  desktopBackText: {
    color: "#d9cfe4",
    fontSize: 14,
    fontWeight: "800",
  },
  posterFrame: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 28px rgba(0, 0, 0, 0.32)" }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.32,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 20 },
        }),
  } as any,
  desktopPoster: {
    width: "100%",
    height: "100%",
    backgroundColor: "#151622",
  },
  posterFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  desktopInfoPanel: {
    flex: 1,
    backgroundColor: "transparent",
    zIndex: 1,
  },
  desktopScrollContent: {
    paddingHorizontal: 44,
    paddingTop: 48,
    paddingBottom: 72,
  },
  headerShell: {
    maxWidth: 1140,
    alignSelf: "stretch",
    paddingBottom: 8,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  eyebrowPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    backgroundColor: "#f2d7ff",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  eyebrowText: {
    color: "#2c1738",
    fontSize: 12,
    fontWeight: "900",
  },
  sourceCountText: {
    color: "#bfb3ca",
    fontSize: 13,
    fontWeight: "700",
  },
  desktopTitle: {
    fontSize: 48,
    fontWeight: "900",
    color: "#fff8ff",
    marginBottom: 14,
    letterSpacing: 0,
    maxWidth: 1050,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaTag: {
    color: "#c6bfd2",
    fontSize: 13,
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingTag: {
    color: "#ffd9a8",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(255,217,168,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  detailActionPanel: {
    maxWidth: 820,
    marginBottom: 28,
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  genrePill: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreText: {
    color: "#e6dff0",
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    color: "#d8d0df",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionSurface: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 24,
    padding: 22,
    marginBottom: 32,
  },
  sectionTitle: {
    color: "#fff8ff",
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 20,
    letterSpacing: 0,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  sourceDisclosureHeader: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  sectionTitleRowCompact: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitleCompact: {
    marginBottom: 2,
  },
  sourceDisclosureMeta: {
    fontSize: 12,
    fontWeight: "700",
  },
  sectionContent: {
    color: "#c6bfd2",
    fontSize: 14,
    lineHeight: 22,
  },
  resContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  resBubble: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  resBubbleActive: {
    backgroundColor: "#d8b4fe",
    borderColor: "#d8b4fe",
  },
  resText: {
    color: "#c6bfd2",
    fontSize: 14,
    fontWeight: "800",
  },
  resTextActive: {
    color: "#2c1738",
  },
  streamListWrapper: {
    maxWidth: 1140,
    paddingBottom: 12,
  },
  emptyText: {
    color: "#a99fb6",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 40,
  },
  deviceHintCard: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,217,168,0.18)",
    backgroundColor: "rgba(255,217,168,0.08)",
    padding: 14,
  },
  deviceHintTitle: {
    color: "#fff8ff",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 3,
  },
  deviceHintText: {
    color: "#c6bfd2",
    fontSize: 12,
    lineHeight: 17,
  },
});
