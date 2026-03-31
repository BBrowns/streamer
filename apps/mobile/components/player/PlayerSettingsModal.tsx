import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
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
  playbackRate: number;
  onSelectPlaybackRate: (rate: number) => void;
}

export function PlayerSettingsModal({
  visible,
  onClose,
  audioTracks,
  subtitles,
  onSelectAudio,
  onSelectSubtitle,
  playbackRate,
  onSelectPlaybackRate,
}: PlayerSettingsModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBg}>
        <View style={styles.sheetContent}>
          <View style={styles.header}>
            <Text style={styles.title}>⚙️ Playback Settings</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>

          {/* Playback Speed */}
          <Text style={styles.sectionTitle}>⏩ Playback Speed</Text>
          <View style={styles.speedRow}>
            {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
              <Pressable
                key={rate}
                style={[
                  styles.speedBtn,
                  playbackRate === rate && styles.speedBtnActive,
                ]}
                onPress={() => onSelectPlaybackRate(rate)}
              >
                <Text
                  style={[
                    styles.speedBtnText,
                    playbackRate === rate && styles.speedBtnTextActive,
                  ]}
                >
                  {rate}x
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Audio Tracks */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
            🔊 Audio Tracks
          </Text>
          {audioTracks.length === 0 ? (
            <Text style={styles.emptyText}>
              No selectable audio tracks — using default.
            </Text>
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
                  {item.active && <Text style={styles.checkIcon}>✓</Text>}
                </Pressable>
              )}
            />
          )}

          {/* Subtitles */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
            💬 Subtitles
          </Text>
          {subtitles.length === 0 ? (
            <Text style={styles.emptyText}>No subtitle tracks available.</Text>
          ) : (
            <>
              <Pressable
                style={[
                  styles.trackRow,
                  subtitles.every((s) => !s.active) && styles.trackRowActive,
                ]}
                onPress={() => onSelectSubtitle(null)}
                accessibilityRole="button"
                accessibilityLabel="Subtitles off"
              >
                <Text style={styles.trackLabel}>Off</Text>
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
                    {item.active && <Text style={styles.checkIcon}>✓</Text>}
                  </Pressable>
                )}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
    zIndex: 50,
  },
  sheetContent: {
    backgroundColor: "#0d0d24",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "60%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { color: "#f8fafc", fontSize: 18, fontWeight: "bold" },
  doneText: { color: "#818cf8", fontWeight: "bold", fontSize: 15 },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptyText: { color: "#a1a1aa", fontSize: 12, fontStyle: "italic" },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    minHeight: 44,
  },
  trackRowActive: { backgroundColor: "rgba(129,140,248,0.15)" },
  trackLabel: { color: "#f8fafc", fontSize: 14, flex: 1 },
  trackLang: { color: "#a1a1aa", fontSize: 12, marginRight: 8 },
  checkIcon: { color: "#818cf8", fontWeight: "bold", fontSize: 16 },
  speedRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  speedBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  speedBtnActive: {
    backgroundColor: "rgba(129,140,248,0.15)",
  },
  speedBtnText: {
    color: "#a1a1aa",
    fontSize: 14,
    fontWeight: "600",
  },
  speedBtnTextActive: {
    color: "#818cf8",
    fontWeight: "bold",
  },
});
