import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { DetailLayoutProps } from "./types";
import { EpisodeSelector } from "../catalog/EpisodeSelector";
import { useTheme } from "../../hooks/useTheme";
import { PlaybackReadinessNotice } from "./PlaybackReadinessNotice";
import { DetailActionPanel } from "./DetailActionPanel";
import { useWindowClass } from "../../hooks/useWindowClass";
import { getWebFocusStyle, uiRadii, uiTypography } from "../ui/designSystem";
import { useTranslation } from "react-i18next";
import { MoreSourcesPanel } from "./MoreSourcesPanel";

export function MobileDetailLayout({
  id,
  castType,
  meta,
  streams,
  streamsLoading,
  initiallyOpenSources,
  inLibrary,
  handleToggleLibrary,
  handlePlayStream,
  handlePlayCandidate,
  handleDownloadStream,
  handleCastStream,
  planningAction,
  playbackNotice,
  onDismissPlaybackNotice,
  onOpenSourcesDevices,
  onBack,
}: DetailLayoutProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { height, isCompact, isLarge } = useWindowClass();
  const backdropHeight = Math.min(
    height * (isCompact ? 0.46 : 0.52),
    isLarge ? 520 : 460,
  );
  const hasMovieSources = castType !== "series" && (streams?.length ?? 0) > 0;
  const sourceCount =
    castType === "series" ? meta.videos?.length || 0 : streams?.length || 0;
  const softSurfaceColor = colors.surfaceElevated;
  const heroGradientColors = isDark
    ? (["transparent", "rgba(8,9,12,0.62)", colors.background] as const)
    : (["transparent", "rgba(243,242,239,0.54)", colors.background] as const);

  const renderHeader = () => (
    <View>
      <View style={[styles.heroContainer, { height: backdropHeight }]}>
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
          <View
            style={[
              styles.backdrop,
              { backgroundColor: colors.surfaceElevated },
            ]}
          />
        )}

        <LinearGradient
          colors={heroGradientColors}
          locations={[0.4, 0.8, 1]}
          style={styles.heroGradient}
        />
      </View>

      <View style={[styles.content, { minHeight: height * 0.6 }]}>
        <Text style={[styles.title, { color: colors.text }]}>{meta.name}</Text>

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
        />

        {!!playbackNotice && !!onDismissPlaybackNotice && (
          <PlaybackReadinessNotice
            notice={playbackNotice}
            onDismiss={onDismissPlaybackNotice}
            onPrimaryAction={onOpenSourcesDevices}
          />
        )}

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
                <Text
                  style={[styles.genreText, { color: colors.textSecondary }]}
                >
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

        <View style={styles.section}>
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
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable
        style={({ focused }: any) => [
          styles.floatingBack,
          {
            backgroundColor: colors.surfaceOverlay,
            borderColor: colors.border,
          },
          Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
        ]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to previous screen"
      >
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {renderHeader()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  floatingBack: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  heroContainer: {
    width: "100%",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  content: {
    padding: 20,
    marginTop: -80,
    zIndex: 2,
  },
  title: {
    ...uiTypography.headline,
    marginBottom: 12,
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
  sourceDisclosure: {
    borderRadius: uiRadii.sheet,
    borderWidth: 0,
    padding: 16,
  },
  sourceDisclosureHeader: {
    minHeight: 52,
    borderRadius: uiRadii.control,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 40,
  },
});
