import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { useState } from "react";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { hapticImpactLight } from "../../lib/haptics";
import type { DetailLayoutProps } from "./types";
import { StreamItem } from "./StreamItem";
import { EpisodeSelector } from "../catalog/EpisodeSelector";
import { FlashList } from "@shopify/flash-list";
import { useTheme } from "../../hooks/useTheme";
import { PlaybackReadinessNotice } from "./PlaybackReadinessNotice";

const { height } = Dimensions.get("window");
const BACKDROP_HEIGHT = height * 0.55;

export function MobileDetailLayout({
  id,
  castType,
  meta,
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
  const hasMovieSources =
    castType !== "series" && availableResolutions.length > 0;
  const primaryTextColor = isDark ? "#2c1738" : "#ffffff";
  const surfaceColor = isDark ? "rgba(255,255,255,0.08)" : colors.card;
  const softSurfaceColor = isDark
    ? "rgba(255,255,255,0.08)"
    : "rgba(255,255,255,0.62)";
  const heroGradientColors = isDark
    ? (["transparent", "rgba(17,18,28,0.58)", colors.background] as const)
    : (["transparent", "rgba(251,246,244,0.5)", colors.background] as const);

  const renderHeader = () => (
    <View>
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
          colors={heroGradientColors}
          locations={[0.4, 0.8, 1]}
          style={styles.heroGradient}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>{meta.name}</Text>

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

        {castType !== "series" && hasMovieSources && (
          <View style={styles.primaryActionRow}>
            <Pressable
              style={[
                styles.playBestBtn,
                { backgroundColor: colors.tint },
                planningAction && styles.actionDisabled,
              ]}
              disabled={!!planningAction}
              onPress={() => handlePlayStream()}
            >
              <Ionicons name="play" size={18} color={primaryTextColor} />
              <Text style={[styles.playBestText, { color: primaryTextColor }]}>
                {planningAction === "play" ? "Finding best..." : "Play Best"}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.secondaryActionBtn,
                { backgroundColor: surfaceColor, borderColor: colors.border },
                planningAction && styles.actionDisabled,
              ]}
              disabled={!!planningAction}
              onPress={() => handleDownloadStream()}
            >
              <Ionicons name="download-outline" size={18} color={colors.tint} />
              <Text
                style={[styles.secondaryActionText, { color: colors.tint }]}
              >
                {planningAction === "download" ? "Preparing..." : "Download"}
              </Text>
            </Pressable>
            {handleCastStream && (
              <Pressable
                style={[
                  styles.secondaryActionBtn,
                  { backgroundColor: surfaceColor, borderColor: colors.border },
                  planningAction && styles.actionDisabled,
                ]}
                disabled={!!planningAction}
                onPress={() => handleCastStream()}
              >
                <Ionicons name="tv-outline" size={18} color={colors.tint} />
                <Text
                  style={[styles.secondaryActionText, { color: colors.tint }]}
                >
                  {planningAction === "cast" ? "Preparing..." : "Cast"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {!!playbackNotice && !!onDismissPlaybackNotice && (
          <PlaybackReadinessNotice
            notice={playbackNotice}
            onDismiss={onDismissPlaybackNotice}
            onPrimaryAction={onOpenSourcesDevices}
          />
        )}

        <Pressable
          style={[
            styles.libraryBtn,
            { backgroundColor: surfaceColor, borderColor: colors.border },
            inLibrary && {
              backgroundColor: colors.tint,
              borderColor: colors.tint,
            },
          ]}
          onPress={handleToggleLibrary}
        >
          <Ionicons
            name={inLibrary ? "checkmark" : "add"}
            size={18}
            color={inLibrary ? primaryTextColor : colors.tint}
          />
          <Text
            style={[
              styles.libraryBtnText,
              { color: inLibrary ? primaryTextColor : colors.tint },
            ]}
          >
            {inLibrary ? "In Library" : "Add to Library"}
          </Text>
        </Pressable>

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
              Cast
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
            <View
              style={[
                styles.sourceDisclosure,
                { backgroundColor: surfaceColor, borderColor: colors.border },
              ]}
            >
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
                  <Ionicons
                    name="layers-outline"
                    size={18}
                    color={colors.tint}
                  />
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
                      Advanced fallback · {availableResolutions.length} groups
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
                <ActivityIndicator color={colors.tint} />
              ) : sourcesOpen && availableResolutions.length > 0 ? (
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
              ) : sourcesOpen ? (
                <Text
                  style={[styles.emptyText, { color: colors.textSecondary }]}
                >
                  No streams available. Install more add-ons.
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable
        style={[
          styles.floatingBack,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.12)"
              : "rgba(255,255,255,0.74)",
            borderColor: colors.border,
          },
        ]}
        onPress={onBack}
      >
        <Ionicons
          name="chevron-back"
          size={28}
          color={isDark ? "#ffffff" : colors.text}
        />
      </Pressable>

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
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#11121c",
  },
  floatingBack: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  heroContainer: {
    width: "100%",
    height: BACKDROP_HEIGHT,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#151622",
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
    color: "#fff8ff",
    marginBottom: 12,
    letterSpacing: 0,
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
  libraryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(216, 180, 254, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(216, 180, 254, 0.28)",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "flex-start",
    marginBottom: 24,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryActionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  playBestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f2d7ff",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 13,
    minHeight: 48,
  },
  playBestText: {
    color: "#2c1738",
    fontWeight: "900",
  },
  secondaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 13,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryActionText: {
    color: "#f2d7ff",
    fontWeight: "800",
  },
  actionDisabled: {
    opacity: 0.55,
  },
  libraryBtnActive: {
    backgroundColor: "#d8b4fe",
    borderColor: "#d8b4fe",
  },
  libraryBtnText: {
    color: "#f2d7ff",
    fontWeight: "800",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  libraryBtnTextActive: {
    color: "#2c1738",
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
  sourceDisclosure: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  sourceDisclosureHeader: {
    minHeight: 52,
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  emptyText: {
    color: "#a99fb6",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 40,
  },
});
