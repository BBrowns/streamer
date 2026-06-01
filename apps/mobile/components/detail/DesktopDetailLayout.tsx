import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { hapticImpactLight } from "../../lib/haptics";
import type { DetailLayoutProps } from "./types";
import { StreamItem } from "./StreamItem";
import { EpisodeSelector } from "../catalog/EpisodeSelector";
import { FlashList } from "@shopify/flash-list";

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
  onBack,
}: DetailLayoutProps) {
  const streamsData =
    castType === "series" ? [] : groupedStreams[selectedResolution!] || [];
  const hasMovieSources = castType !== "series" && (streams?.length ?? 0) > 0;
  const sourceCount =
    castType === "series" ? meta.videos?.length || 0 : streams?.length || 0;

  const renderHeader = () => (
    <View style={styles.headerShell}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowPill}>
          <Ionicons
            name={castType === "series" ? "albums-outline" : "film-outline"}
            size={15}
            color="#2c1738"
          />
          <Text style={styles.eyebrowText}>
            {castType === "series" ? "Series" : "Movie"}
          </Text>
        </View>
        <Text style={styles.sourceCountText}>
          {castType === "series"
            ? `${sourceCount} episodes`
            : `${sourceCount} sources`}
        </Text>
      </View>

      <Text style={styles.desktopTitle}>{meta.name}</Text>

      <View style={styles.metaRow}>
        {!!meta.releaseInfo && (
          <Text style={styles.metaTag}>{meta.releaseInfo}</Text>
        )}
        {!!meta.runtime && <Text style={styles.metaTag}>{meta.runtime}</Text>}
        {!!meta.imdbRating && (
          <Text style={styles.ratingTag}>⭐ {meta.imdbRating}</Text>
        )}
      </View>

      {!!meta.genres && meta.genres.length > 0 && (
        <View style={styles.genreRow}>
          {meta.genres.map((g: string, idx: number) => (
            <View key={`${g}-${idx}`} style={styles.genrePill}>
              <Text style={styles.genreText}>{g}</Text>
            </View>
          ))}
        </View>
      )}

      {!!meta.description && (
        <Text style={styles.description}>{meta.description}</Text>
      )}

      {castType !== "series" && (
        <View style={styles.primaryActionRow}>
          <Pressable
            style={[
              styles.playBestBtn,
              !hasMovieSources && styles.actionDisabled,
            ]}
            disabled={!hasMovieSources}
            onPress={() => handlePlayStream()}
          >
            <Ionicons name="play" size={18} color="#2c1738" />
            <Text style={styles.playBestText}>Play</Text>
          </Pressable>
          <Pressable
            style={[
              styles.secondaryActionBtn,
              !hasMovieSources && styles.actionDisabled,
            ]}
            disabled={!hasMovieSources}
            onPress={() => handleDownloadStream()}
          >
            <Ionicons name="download-outline" size={18} color="#f2d7ff" />
            <Text style={styles.secondaryActionText}>Download</Text>
          </Pressable>
          {handleCastStream && (
            <Pressable
              style={[
                styles.secondaryActionBtn,
                !hasMovieSources && styles.actionDisabled,
              ]}
              disabled={!hasMovieSources}
              onPress={() => handleCastStream()}
            >
              <Ionicons name="tv-outline" size={18} color="#f2d7ff" />
              <Text style={styles.secondaryActionText}>Cast</Text>
            </Pressable>
          )}
        </View>
      )}

      {!!meta.cast && meta.cast.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cast</Text>
          <Text style={styles.sectionContent}>{meta.cast.join(", ")}</Text>
        </View>
      )}

      <View style={styles.sectionSurface}>
        <View style={styles.sectionTitleRow}>
          <Ionicons
            name={castType === "series" ? "list" : "layers-outline"}
            size={18}
            color="#d8b4fe"
          />
          <Text style={styles.sectionTitle}>
            {castType === "series" ? "Episodes" : "More Sources"}
          </Text>
        </View>

        {castType === "series" ? (
          <EpisodeSelector
            seriesId={id}
            videos={meta.videos || []}
            onPlayStream={handlePlayStream}
            onDownloadStream={handleDownloadStream}
          />
        ) : streamsLoading ? (
          <ActivityIndicator color="#d8b4fe" />
        ) : availableResolutions.length > 0 ? (
          <>
            <View style={styles.resContainer}>
              {availableResolutions.map((res) => (
                <Pressable
                  key={res}
                  style={[
                    styles.resBubble,
                    selectedResolution === res && styles.resBubbleActive,
                  ]}
                  onPress={() => {
                    hapticImpactLight();
                    setSelectedResolution(res);
                  }}
                >
                  <Text
                    style={[
                      styles.resText,
                      selectedResolution === res && styles.resTextActive,
                    ]}
                  >
                    {res === "2160p" ? "4K" : res.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>
            No streams available. Install more add-ons.
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.containerDesktop}>
      {!!meta.background && (
        <Image
          source={{ uri: meta.background }}
          style={styles.ambientBackdrop}
          resizeMode="cover"
        />
      )}
      <View style={styles.ambientOverlay} />

      <View style={styles.desktopPosterPanel}>
        <Pressable style={styles.desktopBackBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color="#d9cfe4" />
          <Text style={styles.desktopBackText}>Back</Text>
        </Pressable>
        <View style={styles.posterFrame}>
          {!!meta.poster ? (
            <Image
              source={{ uri: meta.poster }}
              style={styles.desktopPoster}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.posterFallback}>
              <Ionicons name="film-outline" size={44} color="#d8b4fe" />
            </View>
          )}
        </View>
        <Pressable
          style={[styles.libraryBtn, inLibrary && styles.libraryBtnActive]}
          onPress={handleToggleLibrary}
        >
          <Ionicons
            name={inLibrary ? "checkmark" : "add"}
            size={18}
            color={inLibrary ? "#2c1738" : "#f2d7ff"}
          />
          <Text
            style={[
              styles.libraryBtnText,
              inLibrary && styles.libraryBtnTextActive,
            ]}
          >
            {inLibrary ? "In Library" : "Add to Library"}
          </Text>
        </Pressable>
        <View style={styles.deviceHintCard}>
          <Ionicons name="sparkles-outline" size={18} color="#ffd9a8" />
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceHintTitle}>Cinema mode</Text>
            <Text style={styles.deviceHintText}>
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
  libraryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(216, 180, 254, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(216, 180, 254, 0.28)",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    marginTop: 18,
    marginBottom: 16,
    minHeight: 48,
  },
  primaryActionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
    flexWrap: "wrap",
  },
  playBestBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f2d7ff",
    borderRadius: 18,
    paddingHorizontal: 22,
    paddingVertical: 13,
    minHeight: 48,
  },
  actionDisabled: {
    opacity: 0.45,
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
  sectionContent: {
    color: "#c6bfd2",
    fontSize: 14,
    lineHeight: 22,
  },
  resContainer: {
    flexDirection: "row",
    gap: 12,
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
