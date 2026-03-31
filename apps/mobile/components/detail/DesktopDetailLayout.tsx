import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { hapticImpactLight } from "../../lib/haptics";
import type { DetailLayoutProps } from "./types";
import { StreamItem } from "./StreamItem";
import { EpisodeSelector } from "../catalog/EpisodeSelector";

export function DesktopDetailLayout({
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
  onBack,
}: DetailLayoutProps) {
  return (
    <View style={styles.containerDesktop}>
      {/* Left: Poster panel */}
      <View style={styles.desktopPosterPanel}>
        <Pressable style={styles.desktopBackBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={20} color="#888" />
          <Text style={styles.desktopBackText}>Back</Text>
        </Pressable>
        {!!meta.poster && (
          <Image
            source={{ uri: meta.poster }}
            style={styles.desktopPoster}
            resizeMode="cover"
          />
        )}
        <Pressable
          style={[
            styles.libraryBtn,
            inLibrary && styles.libraryBtnActive,
            { marginTop: 16, alignSelf: "stretch" },
          ]}
          onPress={handleToggleLibrary}
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
      </View>

      {/* Right: Scrollable info + streams */}
      <ScrollView
        style={styles.desktopInfoPanel}
        contentContainerStyle={{ padding: 36, paddingBottom: 60 }}
      >
        {!!meta.background && (
          <Image
            source={{ uri: meta.background }}
            style={styles.desktopBgArt}
            resizeMode="cover"
          />
        )}
        <View style={styles.desktopBgOverlay} />

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

        {!!meta.cast && meta.cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <Text style={styles.sectionContent}>{meta.cast.join(", ")}</Text>
          </View>
        )}

        {/* Streams Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons
              name={castType === "series" ? "list" : "layers-outline"}
              size={18}
              color="#00f2ff"
            />
            <Text style={styles.sectionTitle}>
              {castType === "series" ? "Episodes" : "Select Quality"}
            </Text>
          </View>

          {castType === "series" ? (
            <EpisodeSelector
              seriesId={id}
              videos={meta.videos || []}
              onPlayStream={handlePlayStream}
            />
          ) : streamsLoading ? (
            <ActivityIndicator color="#00f2ff" />
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
              <View style={styles.streamList}>
                {groupedStreams[selectedResolution!]?.map((stream, i) => {
                  const streamId =
                    stream.infoHash || stream.url || `stream_${i}`;
                  return (
                    <StreamItem
                      key={`${streamId}_${i}`}
                      stream={stream}
                      index={i}
                      onPress={() => handlePlayStream(stream)}
                      onDownload={() => handleDownloadStream(stream)}
                    />
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>
              No streams available. Install more add-ons.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  containerDesktop: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#07070e",
  },
  desktopPosterPanel: {
    width: 280,
    backgroundColor: "#0a0a14",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.06)",
    padding: 24,
    paddingTop: 16,
  },
  desktopBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 20,
  },
  desktopBackText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "600",
  },
  desktopPoster: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 12,
    backgroundColor: "#111",
  },
  desktopInfoPanel: {
    flex: 1,
    backgroundColor: "#07070e",
  },
  desktopBgArt: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    opacity: 0.08,
  },
  desktopBgOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: "rgba(7,7,14,0.7)",
  },
  desktopTitle: {
    fontSize: 40,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 12,
    letterSpacing: -1,
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaTag: {
    color: "#888888",
    fontSize: 13,
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ratingTag: {
    color: "#ffd600",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: "rgba(255,214,0,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  libraryBtn: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 242, 255, 0.2)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "flex-start",
    marginBottom: 24,
    minHeight: 48,
    justifyContent: "center",
  },
  libraryBtnActive: {
    backgroundColor: "#00f2ff",
    borderColor: "#00f2ff",
  },
  libraryBtnText: {
    color: "#00f2ff",
    fontWeight: "800",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  libraryBtnTextActive: {
    color: "#000000",
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  genrePill: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreText: {
    color: "#bbbbbb",
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    color: "#cccccc",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  sectionContent: {
    color: "#888888",
    fontSize: 14,
    lineHeight: 22,
  },
  resContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  resBubble: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  resBubbleActive: {
    backgroundColor: "#00f2ff",
    borderColor: "#00f2ff",
  },
  resText: {
    color: "#888888",
    fontSize: 14,
    fontWeight: "800",
  },
  resTextActive: {
    color: "#000000",
  },
  streamList: {
    gap: 12,
  },
  emptyText: {
    color: "#555555",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 40,
  },
});
