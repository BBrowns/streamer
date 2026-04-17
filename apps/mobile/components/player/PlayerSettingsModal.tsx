import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.modalBg,
          { backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.3)" },
        ]}
      >
        <View
          style={[
            styles.sheetContent,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              borderTopWidth: 1,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              ⚙️ {t("player.settings.title")}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("player.settings.done")}
            >
              <Text style={[styles.doneText, { color: colors.tint }]}>
                {t("player.settings.done")}
              </Text>
            </Pressable>
          </View>

          {/* Playback Speed */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            ⏩ {t("player.settings.speed")}
          </Text>
          <View style={styles.speedRow}>
            {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
              <Pressable
                key={rate}
                style={[
                  styles.speedBtn,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.05)",
                  },
                  playbackRate === rate && {
                    backgroundColor: colors.tint + "15",
                  },
                ]}
                onPress={() => onSelectPlaybackRate(rate)}
              >
                <Text
                  style={[
                    styles.speedBtnText,
                    { color: colors.textSecondary },
                    playbackRate === rate && {
                      color: colors.tint,
                      fontWeight: "bold",
                    },
                  ]}
                >
                  {rate}x
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Audio Tracks */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.textSecondary, marginTop: 20 },
            ]}
          >
            🔊 {t("player.settings.audio")}
          </Text>
          {audioTracks.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t("player.settings.noAudio")}
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
                    item.active && { backgroundColor: colors.tint + "15" },
                  ]}
                  onPress={() => onSelectAudio(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Audio: ${item.label}${item.active ? ", selected" : ""}`}
                >
                  <Text style={[styles.trackLabel, { color: colors.text }]}>
                    {item.label}
                  </Text>
                  <Text
                    style={[styles.trackLang, { color: colors.textSecondary }]}
                  >
                    {item.language}
                  </Text>
                  {item.active && (
                    <Text style={[styles.checkIcon, { color: colors.tint }]}>
                      ✓
                    </Text>
                  )}
                </Pressable>
              )}
            />
          )}

          {/* Subtitles */}
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.textSecondary, marginTop: 20 },
            ]}
          >
            💬 {t("player.settings.subtitles")}
          </Text>
          {subtitles.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t("player.settings.noSubtitles")}
            </Text>
          ) : (
            <>
              <Pressable
                style={[
                  styles.trackRow,
                  subtitles.every((s) => !s.active) && {
                    backgroundColor: colors.tint + "15",
                  },
                ]}
                onPress={() => onSelectSubtitle(null)}
                accessibilityRole="button"
                accessibilityLabel={t("player.settings.off")}
              >
                <Text style={[styles.trackLabel, { color: colors.text }]}>
                  {t("player.settings.off")}
                </Text>
              </Pressable>
              <FlatList
                data={subtitles}
                keyExtractor={(t) => t.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.trackRow,
                      item.active && { backgroundColor: colors.tint + "15" },
                    ]}
                    onPress={() => onSelectSubtitle(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Subtitle: ${item.label}${item.active ? ", selected" : ""}`}
                  >
                    <Text style={[styles.trackLabel, { color: colors.text }]}>
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.trackLang,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {item.language}
                    </Text>
                    {item.active && (
                      <Text style={[styles.checkIcon, { color: colors.tint }]}>
                        ✓
                      </Text>
                    )}
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
