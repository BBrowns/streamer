import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DetailLayoutProps } from "./types";
import { EpisodeSelector } from "../catalog/EpisodeSelector";
import { useTheme } from "../../hooks/useTheme";
import { PlaybackReadinessNotice } from "./PlaybackReadinessNotice";
import { DetailActionPanel } from "./DetailActionPanel";
import { getWebFocusStyle, uiRadii, uiTypography } from "../ui/designSystem";
import { useTranslation } from "react-i18next";
import { MoreSourcesPanel } from "./MoreSourcesPanel";
import { MediaArtwork } from "../ui/MediaArtwork";

export function DesktopDetailLayout({
  id,
  castType,
  meta,
  streams,
  streamsLoading,
  initiallyOpenSources,
  inLibrary,
  handleToggleLibrary,
  trailerUrl,
  onWatchTrailer,
  handlePlayStream,
  onPlayIntent,
  handlePlayCandidate,
  handleDownloadStream,
  handleCastStream,
  planningAction,
  playbackNotice,
  onDismissPlaybackNotice,
  onPlaybackNoticeAction,
  onBack,
}: DetailLayoutProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const hasMovieSources = castType !== "series" && (streams?.length ?? 0) > 0;
  const sourceCount =
    castType === "series" ? meta.videos?.length || 0 : streams?.length || 0;
  const surfaceColor = colors.card;
  const softSurfaceColor = colors.surfaceElevated;

  const renderHeader = () => (
    <View style={styles.headerShell}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowPill}>
          <Ionicons
            name={castType === "series" ? "albums-outline" : "film-outline"}
            size={15}
            color={colors.tint}
          />
          <Text style={[styles.eyebrowText, { color: colors.tint }]}>
            {t(
              castType === "series"
                ? "common.media.series"
                : "common.media.movie",
            )}
          </Text>
        </View>
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
                backgroundColor: "transparent",
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
                backgroundColor: "transparent",
              },
            ]}
          >
            {meta.runtime}
          </Text>
        )}
        {!!meta.imdbRating && (
          <Text
            style={[
              styles.ratingTag,
              {
                color: colors.warning,
                backgroundColor: "transparent",
              },
            ]}
          >
            ⭐ {meta.imdbRating}
          </Text>
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
        hasTrailer={!!trailerUrl}
        planningAction={planningAction}
        onPlayBest={() => handlePlayStream()}
        onPlayIntent={onPlayIntent}
        onDownload={() => handleDownloadStream()}
        onCast={handleCastStream ? () => handleCastStream() : undefined}
        onToggleLibrary={handleToggleLibrary}
        onWatchTrailer={onWatchTrailer}
        style={styles.detailActionPanel}
      />

      {!!playbackNotice && !!onDismissPlaybackNotice && (
        <PlaybackReadinessNotice
          notice={playbackNotice}
          onDismiss={onDismissPlaybackNotice}
          onPrimaryAction={onPlaybackNoticeAction}
        />
      )}

      {!!meta.cast && meta.cast.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("common.castAndCrew", { defaultValue: "Cast & crew" })}
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
          { backgroundColor: surfaceColor, borderColor: "transparent" },
        ]}
      >
        {castType === "series" ? (
          <>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="list" size={18} color={colors.tint} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t("detail.sources.episodes")}
              </Text>
            </View>
            <EpisodeSelector
              seriesId={id}
              videos={meta.videos || []}
              onPlayStream={handlePlayStream}
              onPlayIntent={onPlayIntent}
              onPlayCandidate={handlePlayCandidate}
              onDownloadStream={handleDownloadStream}
            />
          </>
        ) : (
          <MoreSourcesPanel
            contentId={id}
            title={meta.name}
            initiallyOpen={initiallyOpenSources}
            onSelect={(plan, candidateId) =>
              handlePlayCandidate(plan, candidateId)
            }
          />
        )}
      </View>
    </View>
  );

  return (
    <View
      style={[styles.containerDesktop, { backgroundColor: colors.background }]}
    >
      {!!meta.background && (
        <MediaArtwork
          uri={meta.background}
          variant="backdrop"
          accessible={false}
          style={styles.ambientBackdrop}
        />
      )}
      <View
        style={[
          styles.ambientOverlay,
          {
            backgroundColor: colors.background + (isDark ? "D6" : "E0"),
          },
        ]}
      />

      <View
        style={[
          styles.desktopPosterPanel,
          { backgroundColor: "transparent", borderRightColor: "transparent" },
        ]}
      >
        <Pressable
          style={({ focused }: any) => [
            styles.desktopBackBtn,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to previous screen"
        >
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
        <View
          style={[
            styles.posterFrame,
            {
              borderColor: "transparent",
              backgroundColor: colors.surfaceElevated,
            },
          ]}
        >
          <MediaArtwork
            uri={meta.poster}
            title={meta.name}
            variant="poster"
            accessibilityLabel={`${meta.name} poster`}
            style={styles.desktopPoster}
          />
        </View>
      </View>

      <View style={styles.desktopInfoPanel}>
        <ScrollView
          contentContainerStyle={styles.desktopScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {renderHeader()}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  containerDesktop: {
    flex: 1,
    flexDirection: "row",
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
  },
  desktopPosterPanel: {
    width: 360,
    borderRightWidth: 0,
    padding: 32,
    paddingTop: 24,
    zIndex: 2,
  },
  desktopBackBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 28,
    alignSelf: "flex-start",
    borderRadius: uiRadii.control,
    paddingHorizontal: 6,
  },
  desktopBackText: {
    fontSize: 14,
    fontWeight: "800",
  },
  posterFrame: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: uiRadii.card,
    borderWidth: 0,
    overflow: "hidden",
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
    paddingVertical: 4,
  },
  eyebrowText: {
    ...uiTypography.sectionLabel,
  },
  sourceCountText: {
    fontSize: 13,
    fontWeight: "700",
  },
  desktopTitle: {
    ...uiTypography.display,
    marginBottom: 14,
    maxWidth: 1050,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaTag: {
    ...uiTypography.label,
    paddingHorizontal: 0,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingTag: {
    ...uiTypography.label,
    paddingHorizontal: 0,
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
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionSurface: {
    borderWidth: 0,
    borderRadius: uiRadii.sheet,
    padding: 22,
    marginBottom: 32,
  },
  sectionTitle: {
    ...uiTypography.title,
    fontSize: 20,
    lineHeight: 26,
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
    borderRadius: uiRadii.control,
    paddingHorizontal: 8,
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
    minHeight: 44,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    justifyContent: "center",
  },
  resText: {
    fontSize: 14,
    fontWeight: "800",
  },
  streamListWrapper: {
    maxWidth: 1140,
    paddingBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 40,
  },
});
