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
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { hapticImpactLight } from "../../lib/haptics";
import type { DetailLayoutProps } from "./types";
import { StreamItem } from "./StreamItem";
import { EpisodeSelector } from "../catalog/EpisodeSelector";
import { FlashList } from "@shopify/flash-list";

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
  onBack,
}: DetailLayoutProps) {
  const streamsData =
    castType === "series" ? [] : groupedStreams[selectedResolution!] || [];
  const hasMovieSources =
    castType !== "series" && availableResolutions.length > 0;

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
          colors={["transparent", "rgba(17,18,28,0.58)", "#11121c"]}
          locations={[0.4, 0.8, 1]}
          style={styles.heroGradient}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{meta.name}</Text>

        <View style={styles.metaRow}>
          {!!meta.releaseInfo && (
            <Text style={styles.metaTag}>{meta.releaseInfo}</Text>
          )}
          {!!meta.runtime && <Text style={styles.metaTag}>{meta.runtime}</Text>}
          {!!meta.imdbRating && (
            <Text style={styles.ratingTag}>⭐ {meta.imdbRating}</Text>
          )}
        </View>

        {castType !== "series" && hasMovieSources && (
          <View style={styles.primaryActionRow}>
            <Pressable
              style={styles.playBestBtn}
              onPress={() => handlePlayStream()}
            >
              <Ionicons name="play" size={18} color="#2c1738" />
              <Text style={styles.playBestText}>Play</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryActionBtn}
              onPress={() => handleDownloadStream()}
            >
              <Ionicons name="download-outline" size={18} color="#f2d7ff" />
              <Text style={styles.secondaryActionText}>Download</Text>
            </Pressable>
            {handleCastStream && (
              <Pressable
                style={styles.secondaryActionBtn}
                onPress={() => handleCastStream()}
              >
                <Ionicons name="tv-outline" size={18} color="#f2d7ff" />
                <Text style={styles.secondaryActionText}>Cast</Text>
              </Pressable>
            )}
          </View>
        )}

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
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable style={styles.floatingBack} onPress={onBack}>
        <Ionicons name="chevron-back" size={28} color="#ffffff" />
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
