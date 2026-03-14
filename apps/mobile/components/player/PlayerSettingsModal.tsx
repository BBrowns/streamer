import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../ui/EmptyState";
import type {
  AudioTrack,
  SubtitleTrack,
} from "../../services/streamEngine/IStreamEngine";

interface PlayerSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  audioTracks: AudioTrack[];
  subtitles: SubtitleTrack[];
  onSelectAudio: (id: string) => void;
  onSelectSubtitle: (id: string | null) => void;
}

/**
 * Modern Responsive Modal for playback settings.
 * Desktop: Centered compact card.
 * Mobile: Bottom sheet.
 */
export function PlayerSettingsModal({
  visible,
  onClose,
  audioTracks,
  subtitles,
  onSelectAudio,
  onSelectSubtitle,
}: PlayerSettingsModalProps) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width > 1024;

  return (
    <Modal
      visible={visible}
      animationType={isDesktop ? "fade" : "slide"}
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.modalBg, isDesktop && styles.modalBgDesktop]}>
        <View
          style={[styles.sheetContent, isDesktop && styles.sheetContentDesktop]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Playback Settings</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={styles.doneText}>
                {isDesktop ? "Close" : "Done"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.tabsContainer}>
            {/* Audio Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="volume-medium-outline"
                  size={20}
                  color="#00f2ff"
                  style={styles.sectionIcon}
                />
                <Text style={styles.sectionTitle}>Audio</Text>
              </View>
              {audioTracks.length === 0 ? (
                <EmptyState
                  icon="close-circle-outline"
                  title="No Audio Tracks"
                  description="Defaulting to system audio."
                />
              ) : (
                <FlatList
                  data={audioTracks}
                  keyExtractor={(t) => t.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <Pressable
                      style={[
                        styles.trackRow,
                        item.active && styles.trackRowActive,
                      ]}
                      onPress={() => onSelectAudio(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Audio: ${item.label}${item.active ? ", selected" : ""}`}
                    >
                      <Text style={styles.trackLabel}>{item.label}</Text>
                      <Text style={styles.trackLang}>{item.language}</Text>
                      {item.active && (
                        <Ionicons name="checkmark" size={18} color="#00f2ff" />
                      )}
                    </Pressable>
                  )}
                />
              )}
            </View>

            {/* Subtitles Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="chatbubble-outline"
                  size={20}
                  color="#00f2ff"
                  style={styles.sectionIcon}
                />
                <Text style={styles.sectionTitle}>Subtitles</Text>
              </View>
              {subtitles.length === 0 ? (
                <EmptyState
                  icon="close-circle-outline"
                  title="No Subtitles"
                  description="No subtitle tracks found."
                />
              ) : (
                <View>
                  <Pressable
                    style={[
                      styles.trackRow,
                      subtitles.every((s) => !s.active) &&
                        styles.trackRowActive,
                    ]}
                    onPress={() => onSelectSubtitle(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Subtitles off"
                  >
                    <Text style={styles.trackLabel}>Off</Text>
                    {subtitles.every((s) => !s.active) && (
                      <Ionicons name="checkmark" size={18} color="#00f2ff" />
                    )}
                  </Pressable>
                  <FlatList
                    data={subtitles}
                    keyExtractor={(t) => t.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                      <Pressable
                        style={[
                          styles.trackRow,
                          item.active && styles.trackRowActive,
                        ]}
                        onPress={() => onSelectSubtitle(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Subtitle: ${item.label}${item.active ? ", selected" : ""}`}
                      >
                        <Text style={styles.trackLabel}>{item.label}</Text>
                        <Text style={styles.trackLang}>{item.language}</Text>
                        {item.active && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color="#00f2ff"
                          />
                        )}
                      </Pressable>
                    )}
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
    zIndex: 100,
  },
  modalBgDesktop: {
    justifyContent: "center",
    alignItems: "center",
  },
  sheetContent: {
    backgroundColor: "#0d0d0d",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 50,
    maxHeight: "80%",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  sheetContentDesktop: {
    width: 500,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  doneText: {
    color: "#00f2ff",
    fontWeight: "800",
    fontSize: 16,
  },
  tabsContainer: {
    gap: 24,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIcon: {
    marginRight: 8,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  trackRowActive: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 242, 255, 0.2)",
  },
  trackLabel: {
    color: "#ffffff",
    fontSize: 15,
    flex: 1,
    fontWeight: "600",
  },
  trackLang: {
    color: "#888888",
    fontSize: 13,
    marginRight: 12,
    fontWeight: "500",
  },
});
