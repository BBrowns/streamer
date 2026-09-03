import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { DetailLayoutProps } from "./types";
import { EpisodeSelector } from "../catalog/EpisodeSelector";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import {
  useCinematicTheme,
  useCinematicThemeSource,
} from "../../contexts/CinematicThemeContext";
import { PlaybackReadinessNotice } from "./PlaybackReadinessNotice";
import { DetailActionPanel } from "./DetailActionPanel";
import {
  getWebFocusStyle,
  getWindowGutter,
  uiLayout,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "../ui/designSystem";
import { useTranslation } from "react-i18next";
import { MoreSourcesPanel } from "./MoreSourcesPanel";
import { MediaArtwork } from "../ui/MediaArtwork";
import { useDesktopTopBarScroll } from "../ui/DesktopLayout";

function MetadataItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const { colors } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.metadataItem}>
      <Text style={[styles.metadataLabel, { color: colors.textTertiary }]}>
        {label}
      </Text>
      <Text style={[styles.metadataValue, { color: colors.textSecondary }]}>
        {value}
      </Text>
    </View>
  );
}

export function DesktopDetailLayout({
  id,
  castType,
  meta,
  streams,
  streamsLoading,
  availableResolutions,
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
  const { colors } = useTheme();
  const { theme: cinematicTheme } = useCinematicTheme();
  const { t } = useTranslation();
  const { height, windowClass } = useWindowClass();
  const reportTopBarScroll = useDesktopTopBarScroll();
  const gutter = getWindowGutter(windowClass);
  const heroHeight = Math.max(540, Math.min(760, height * 0.64));
  const hasMovieSources = castType === "movie" && (streams?.length ?? 0) > 0;
  const sourceCount =
    castType === "series" ? meta.videos?.length || 0 : streams?.length || 0;
  const hasBackdrop = Boolean(meta.background?.trim());

  useCinematicThemeSource({
    contentKey: `${castType}:${id}`,
    backgroundUri: meta.background,
    posterUri: meta.poster,
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        onScroll={(event) =>
          reportTopBarScroll(event.nativeEvent.contentOffset.y)
        }
        scrollEventThrottle={16}
      >
        <View
          style={[
            styles.hero,
            { height: heroHeight, backgroundColor: cinematicTheme.ambient },
          ]}
        >
          <LinearGradient
            colors={[
              cinematicTheme.ambient,
              cinematicTheme.ambientMuted,
              colors.background,
            ]}
            style={styles.fill}
          />
          {hasBackdrop ? (
            <MediaArtwork
              uri={meta.background}
              title={meta.name}
              variant="backdrop"
              accessible={false}
              style={styles.fill}
            />
          ) : null}
          <LinearGradient
            colors={[
              "rgba(8,9,11,0.56)",
              "rgba(8,9,11,0.18)",
              "rgba(8,9,11,0)",
            ]}
            locations={[0, 0.16, 0.34]}
            style={styles.fill}
          />
          <LinearGradient
            colors={[
              "rgba(8,9,11,0.84)",
              "rgba(8,9,11,0.34)",
              "rgba(8,9,11,0.08)",
            ]}
            locations={[0, 0.52, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.fill}
          />
          <LinearGradient
            colors={["rgba(8,9,11,0)", "rgba(8,9,11,0.22)", colors.background]}
            locations={[0, 0.62, 1]}
            style={styles.fill}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("detail.backAccessibility")}
            onPress={onBack}
            style={({ pressed, focused }: any) => [
              styles.backButton,
              {
                backgroundColor: colors.surfaceFloating,
                borderColor: colors.borderStrong,
              },
              pressed && { opacity: 0.68 },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
            ]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>
              {t("detail.back")}
            </Text>
          </Pressable>

          <View
            style={[
              styles.heroBoundary,
              {
                maxWidth: uiLayout.pageWidths.cinematic,
                paddingHorizontal: gutter,
              },
            ]}
          >
            <View style={styles.heroInner}>
              <View style={styles.posterFrame}>
                <MediaArtwork
                  uri={meta.poster}
                  title={meta.name}
                  variant="poster"
                  accessibilityLabel={`${meta.name} poster`}
                  contentFit="cover"
                  style={styles.poster}
                />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>
                  {t(
                    castType === "series"
                      ? "common.media.series"
                      : "common.media.movie",
                  )}
                </Text>
                <Text numberOfLines={3} style={styles.title}>
                  {meta.name}
                </Text>
                <View style={styles.metaRow}>
                  {meta.releaseInfo ? (
                    <Text style={styles.heroMeta}>{meta.releaseInfo}</Text>
                  ) : null}
                  {meta.runtime ? (
                    <Text style={styles.heroMeta}>{meta.runtime}</Text>
                  ) : null}
                  {meta.imdbRating ? (
                    <View style={styles.rating}>
                      <Ionicons name="star" size={13} color="#E7B86A" />
                      <Text style={styles.heroMeta}>{meta.imdbRating}</Text>
                    </View>
                  ) : null}
                </View>
                {meta.genres?.length ? (
                  <Text style={styles.genres} numberOfLines={1}>
                    {meta.genres.join(" · ")}
                  </Text>
                ) : null}
                {meta.description ? (
                  <Text numberOfLines={4} style={styles.synopsis}>
                    {meta.description}
                  </Text>
                ) : null}
                <DetailActionPanel
                  castType={castType}
                  sourceCount={sourceCount}
                  episodeCount={meta.videos?.length || 0}
                  streamsLoading={streamsLoading}
                  hasPlayableSources={hasMovieSources}
                  inLibrary={Boolean(inLibrary)}
                  focusColor={cinematicTheme.focus}
                  hasTrailer={Boolean(trailerUrl)}
                  planningAction={planningAction}
                  onPlayBest={() => handlePlayStream()}
                  onPlayIntent={onPlayIntent}
                  onDownload={() => handleDownloadStream()}
                  onCast={
                    handleCastStream ? () => handleCastStream() : undefined
                  }
                  onToggleLibrary={handleToggleLibrary}
                  onWatchTrailer={onWatchTrailer}
                  style={styles.actions}
                />
              </View>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.bodyBoundary,
            { maxWidth: uiLayout.detailMaxWidth, paddingHorizontal: gutter },
          ]}
        >
          {playbackNotice && onDismissPlaybackNotice ? (
            <PlaybackReadinessNotice
              notice={playbackNotice}
              onDismiss={onDismissPlaybackNotice}
              onPrimaryAction={onPlaybackNoticeAction}
            />
          ) : null}

          <View style={styles.bodyColumns}>
            <View style={styles.mainColumn}>
              {castType === "series" ? (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {t("detail.sources.episodes")}
                  </Text>
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
                <>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {t("detail.story")}
                  </Text>
                  {meta.description ? (
                    <Text
                      style={[styles.story, { color: colors.textSecondary }]}
                    >
                      {meta.description}
                    </Text>
                  ) : null}
                  <View style={styles.sourcesSection}>
                    <MoreSourcesPanel
                      contentId={id}
                      title={meta.name}
                      sourceCount={sourceCount}
                      initiallyOpen={initiallyOpenSources}
                      onSelect={(plan, candidateId) =>
                        handlePlayCandidate(plan, candidateId)
                      }
                    />
                  </View>
                </>
              )}
            </View>

            <View
              style={[
                styles.metadataColumn,
                { borderLeftColor: colors.borderSubtle },
              ]}
            >
              <Text style={[styles.metadataHeading, { color: colors.text }]}>
                {t("detail.mediaInformation")}
              </Text>
              <MetadataItem
                label={t("detail.metadata.director")}
                value={meta.director?.join(", ")}
              />
              <MetadataItem
                label={t("detail.metadata.cast")}
                value={meta.cast?.slice(0, 6).join(", ")}
              />
              <MetadataItem
                label={t("detail.metadata.language")}
                value={meta.originalLanguage}
              />
              <MetadataItem
                label={t("detail.metadata.runtime")}
                value={meta.runtime}
              />
              <MetadataItem
                label={t("detail.metadata.quality")}
                value={availableResolutions.join(" · ")}
              />
              <MetadataItem
                label={t("detail.metadata.sources")}
                value={sourceCount ? String(sourceCount) : undefined}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { width: "100%", position: "relative", overflow: "hidden" },
  fill: { ...StyleSheet.absoluteFill },
  backButton: {
    position: "absolute",
    top: 88,
    left: 24,
    zIndex: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  backText: { ...uiTypography.label },
  heroBoundary: {
    width: "100%",
    alignSelf: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 36,
    paddingBottom: 52,
  },
  posterFrame: {
    width: 220,
    aspectRatio: 2 / 3,
    borderRadius: uiRadii.card,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 30px rgba(0,0,0,0.42)" }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.42,
          shadowRadius: 30,
        }),
    elevation: 16,
  } as any,
  poster: { width: "100%", height: "100%" },
  heroCopy: { flex: 1, maxWidth: 700, paddingBottom: 2 },
  eyebrow: {
    ...uiTypography.sectionLabel,
    color: "rgba(244,242,238,0.68)",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    ...uiTypography.cinematicDisplay,
    color: "#F4F2EE",
    fontSize: 64,
    lineHeight: 64,
    letterSpacing: -1.4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 14,
  },
  heroMeta: { ...uiTypography.label, color: "rgba(244,242,238,0.78)" },
  rating: { flexDirection: "row", alignItems: "center", gap: 4 },
  genres: {
    ...uiTypography.caption,
    color: "rgba(244,242,238,0.62)",
    marginTop: 10,
  },
  synopsis: {
    ...uiTypography.body,
    color: "rgba(244,242,238,0.76)",
    maxWidth: 640,
    marginTop: 14,
  },
  actions: { marginTop: 22, marginBottom: 0, maxWidth: 680 },
  bodyBoundary: {
    width: "100%",
    alignSelf: "center",
    paddingTop: 44,
    paddingBottom: 80,
  },
  bodyColumns: { flexDirection: "row", alignItems: "flex-start", gap: 44 },
  mainColumn: { flex: 2, minWidth: 0 },
  metadataColumn: {
    flex: 1,
    minWidth: 240,
    borderLeftWidth: 1,
    paddingLeft: 32,
  },
  sectionTitle: {
    ...uiTypography.title,
    fontSize: 22,
    lineHeight: 28,
    marginBottom: 20,
  },
  story: { ...uiTypography.body, fontSize: 16, lineHeight: 25, maxWidth: 680 },
  sourcesSection: { marginTop: 40 },
  metadataHeading: { ...uiTypography.control, marginBottom: 22 },
  metadataItem: { marginBottom: 20, gap: 5 },
  metadataLabel: {
    ...uiTypography.sectionLabel,
    textTransform: "uppercase",
    fontSize: 10,
  },
  metadataValue: { ...uiTypography.body, fontSize: 14, lineHeight: 21 },
});
