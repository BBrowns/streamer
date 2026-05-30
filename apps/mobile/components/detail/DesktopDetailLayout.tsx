import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
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
  const streamsData =
    castType === "series" ? [] : groupedStreams[selectedResolution!] || [];
  const bestStream = streamsData[0];

  const renderHeader = () => (
    <View>
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

      {castType !== "series" && bestStream && (
        <View style={styles.primaryActionRow}>
          <Pressable
            style={styles.playBestBtn}
            onPress={() => handlePlayStream(bestStream)}
          >
            <Ionicons name="play" size={18} color="#2c1738" />
            <Text style={styles.playBestText}>Play Best</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryActionBtn}
            onPress={() => handleDownloadStream(bestStream)}
          >
            <Ionicons name="download-outline" size={18} color="#f2d7ff" />
            <Text style={styles.secondaryActionText}>Download</Text>
          </Pressable>
        </View>
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
          contentContainerStyle={{ padding: 36, paddingBottom: 60 }}
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
  },
  desktopPosterPanel: {
    width: 280,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.14)",
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
    color: "#c6bfd2",
    fontSize: 14,
    fontWeight: "600",
  },
  desktopPoster: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 18,
    backgroundColor: "#151622",
  },
  desktopInfoPanel: {
    flex: 1,
    backgroundColor: "#11121c",
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
    backgroundColor: "rgba(17,18,28,0.72)",
  },
  desktopTitle: {
    fontSize: 40,
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
    paddingBottom: 12,
  },
  emptyText: {
    color: "#a99fb6",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 40,
  },
});
