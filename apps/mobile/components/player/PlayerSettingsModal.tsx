import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import type {
  AudioTrack,
  SubtitleTrack,
} from "../../services/streamEngine/IStreamEngine";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";

interface PlayerSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  audioTracks: AudioTrack[];
  subtitles: SubtitleTrack[];
  onSelectAudio: (id: string | null) => void;
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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [focusedControl, setFocusedControl] = useState<string | null>(null);

  const webFocusProps = (control: string) =>
    Platform.OS === "web"
      ? {
          onFocus: () => setFocusedControl(control),
          onBlur: () => setFocusedControl(null),
        }
      : {};

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? "none" : "slide"}
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.modalBg, { backgroundColor: colors.scrim }]}>
        <View
          style={[
            styles.sheetContent,
            {
              backgroundColor: colors.surfaceElevated,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {t("player.settings.title")}
            </Text>
            <Pressable
              {...webFocusProps("done")}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("player.settings.done")}
              style={({ pressed }) => [
                styles.doneButton,
                pressed && { backgroundColor: colors.surfaceSubtle },
                focusedControl === "done" && getWebFocusStyle(colors.focus),
              ]}
            >
              <Text style={[styles.doneText, { color: colors.text }]}>
                {t("player.settings.done")}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Playback Speed */}
            <View style={styles.sectionHeader}>
              <Ionicons
                name="speedometer-outline"
                size={18}
                color={colors.textSecondary}
              />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t("player.settings.speed")}
              </Text>
            </View>
            <View style={styles.speedRow}>
              {[0.5, 1, 1.25, 1.5, 2].map((rate) => {
                const control = `speed-${rate}`;
                const selected = playbackRate === rate;
                return (
                  <Pressable
                    {...webFocusProps(control)}
                    key={rate}
                    style={({ pressed }) => [
                      styles.speedBtn,
                      {
                        backgroundColor: selected
                          ? colors.tint + "18"
                          : colors.surfaceSubtle,
                      },
                      pressed && { opacity: 0.78 },
                      focusedControl === control &&
                        getWebFocusStyle(colors.focus),
                    ]}
                    onPress={() => onSelectPlaybackRate(rate)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${t("player.settings.speed")}: ${rate}x`}
                  >
                    <Text
                      style={[
                        styles.speedBtnText,
                        {
                          color: selected ? colors.tint : colors.textSecondary,
                        },
                      ]}
                    >
                      {rate}x
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Audio Tracks */}
            <View style={[styles.sectionHeader, styles.sectionSpacing]}>
              <Ionicons
                name="volume-high-outline"
                size={18}
                color={colors.textSecondary}
              />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t("player.settings.audio")}
              </Text>
            </View>
            {audioTracks.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("player.settings.noAudio")}
              </Text>
            ) : (
              <View accessibilityRole="radiogroup">
                {audioTracks.map((item) => {
                  const control = `audio-${item.id}`;
                  return (
                    <Pressable
                      {...webFocusProps(control)}
                      key={item.id}
                      style={({ pressed }) => [
                        styles.trackRow,
                        {
                          backgroundColor: item.active
                            ? colors.tint + "18"
                            : "transparent",
                        },
                        pressed && { backgroundColor: colors.surfaceSubtle },
                        focusedControl === control &&
                          getWebFocusStyle(colors.focus),
                      ]}
                      onPress={() => onSelectAudio(item.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: !!item.active }}
                      accessibilityLabel={`${t("player.settings.audio")}: ${item.label}`}
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
                        <Text
                          style={[styles.checkIcon, { color: colors.tint }]}
                        >
                          ✓
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Subtitles */}
            <View style={[styles.sectionHeader, styles.sectionSpacing]}>
              <Ionicons
                name="text-outline"
                size={18}
                color={colors.textSecondary}
              />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t("player.settings.subtitles")}
              </Text>
            </View>
            {subtitles.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {t("player.settings.noSubtitles")}
              </Text>
            ) : (
              <>
                <Pressable
                  {...webFocusProps("subtitle-off")}
                  style={({ pressed }) => [
                    styles.trackRow,
                    subtitles.every((s) => !s.active) && {
                      backgroundColor: colors.tint + "18",
                    },
                    pressed && { backgroundColor: colors.surfaceSubtle },
                    focusedControl === "subtitle-off" &&
                      getWebFocusStyle(colors.focus),
                  ]}
                  onPress={() => onSelectSubtitle(null)}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: subtitles.every((subtitle) => !subtitle.active),
                  }}
                  accessibilityLabel={t("player.settings.off")}
                >
                  <Text style={[styles.trackLabel, { color: colors.text }]}>
                    {t("player.settings.off")}
                  </Text>
                </Pressable>
                <View accessibilityRole="radiogroup">
                  {subtitles.map((item) => {
                    const control = `subtitle-${item.id}`;
                    return (
                      <Pressable
                        {...webFocusProps(control)}
                        key={item.id}
                        style={({ pressed }) => [
                          styles.trackRow,
                          {
                            backgroundColor: item.active
                              ? colors.tint + "18"
                              : "transparent",
                          },
                          pressed && { backgroundColor: colors.surfaceSubtle },
                          focusedControl === control &&
                            getWebFocusStyle(colors.focus),
                        ]}
                        onPress={() => onSelectSubtitle(item.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: !!item.active }}
                        accessibilityLabel={`${t("player.settings.subtitles")}: ${item.label}`}
                      >
                        <Text
                          style={[styles.trackLabel, { color: colors.text }]}
                        >
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
                          <Text
                            style={[styles.checkIcon, { color: colors.tint }]}
                          >
                            ✓
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    justifyContent: "flex-end",
    zIndex: 50,
  },
  sheetContent: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    borderTopLeftRadius: uiRadii.sheet,
    borderTopRightRadius: uiRadii.sheet,
    padding: uiSpacing.xl,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: uiSpacing.xl,
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: uiSpacing.huge },
  title: { ...uiTypography.title, fontSize: 20, lineHeight: 26 },
  doneButton: {
    minWidth: uiTouchTarget,
    minHeight: uiTouchTarget,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { ...uiTypography.control },
  sectionHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
    marginBottom: uiSpacing.sm,
  },
  sectionSpacing: { marginTop: uiSpacing.xl },
  sectionTitle: {
    ...uiTypography.label,
    fontSize: 14,
  },
  emptyText: { ...uiTypography.caption, paddingVertical: uiSpacing.sm },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: uiSpacing.sm,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.control,
    marginBottom: uiSpacing.xs,
    minHeight: uiTouchTarget,
  },
  trackLabel: { ...uiTypography.body, fontSize: 14, flex: 1 },
  trackLang: { ...uiTypography.caption, marginRight: uiSpacing.sm },
  checkIcon: { ...uiTypography.control, fontSize: 16 },
  speedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiSpacing.sm,
    marginBottom: uiSpacing.xs,
  },
  speedBtn: {
    minWidth: 54,
    minHeight: uiTouchTarget,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  speedBtnText: {
    ...uiTypography.control,
  },
});
