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
import {
  isFocusVisibleEvent,
  setWebInputModality,
} from "../../hooks/useWebPressableActivation";
import { playerChrome } from "./playerChrome";
import type {
  SubtitleAccessibilityPreference,
  SubtitleBackground,
  SubtitleFontFamily,
  SubtitleMode,
  SubtitleTextSize,
  SubtitleVerticalPosition,
} from "../../stores/playerStore";
import type { PlaybackDiagnosticRow } from "../../services/playback/PlaybackDiagnostics";

interface PlayerSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  audioTracks: AudioTrack[];
  subtitles: SubtitleTrack[];
  onSelectAudio: (id: string | null) => void;
  onSelectSubtitle: (id: string | null) => void;
  playbackRate: number;
  onSelectPlaybackRate: (rate: number) => void;
  subtitleMode: SubtitleMode;
  onSelectSubtitleMode: (mode: SubtitleMode) => void;
  subtitleAccessibility: SubtitleAccessibilityPreference;
  onSelectSubtitleAccessibility: (
    preference: SubtitleAccessibilityPreference,
  ) => void;
  subtitleTextSize: SubtitleTextSize;
  onSelectSubtitleTextSize: (size: SubtitleTextSize) => void;
  subtitleBackground: SubtitleBackground;
  onSelectSubtitleBackground: (background: SubtitleBackground) => void;
  subtitleBackgroundOpacity: number;
  onSelectSubtitleBackgroundOpacity: (opacity: number) => void;
  subtitleVerticalPosition: SubtitleVerticalPosition;
  onSelectSubtitleVerticalPosition: (
    position: SubtitleVerticalPosition,
  ) => void;
  subtitleFontFamily: SubtitleFontFamily;
  onSelectSubtitleFontFamily: (fontFamily: SubtitleFontFamily) => void;
  subtitleSyncOffsetSeconds: number;
  onSelectSubtitleSyncOffset: (offset: number) => void;
  onResetSubtitleStyle: () => void;
  diagnostics: PlaybackDiagnosticRow[];
}

function PreferenceChoiceRow({
  label,
  selected,
  values,
  onSelect,
}: {
  label: string;
  selected: string;
  values: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.preferenceGroup}>
      <Text style={[styles.preferenceLabel, { color: playerChrome.textMuted }]}>
        {label}
      </Text>
      <View style={styles.preferenceChoices} accessibilityRole="radiogroup">
        {values.map((choice) => {
          const active = choice.value === selected;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${label}: ${choice.label}`}
              onPress={() => onSelect(choice.value)}
              style={({ pressed }) => [
                styles.preferenceChoice,
                {
                  backgroundColor: active
                    ? playerChrome.accent + "33"
                    : playerChrome.surfaceRaised,
                },
                pressed && { opacity: 0.78 },
              ]}
            >
              <Text
                style={[
                  styles.preferenceChoiceText,
                  {
                    color: active ? playerChrome.text : playerChrome.textMuted,
                  },
                ]}
              >
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
  subtitleMode,
  onSelectSubtitleMode,
  subtitleAccessibility,
  onSelectSubtitleAccessibility,
  subtitleTextSize,
  onSelectSubtitleTextSize,
  subtitleBackground,
  onSelectSubtitleBackground,
  subtitleBackgroundOpacity,
  onSelectSubtitleBackgroundOpacity,
  subtitleVerticalPosition,
  onSelectSubtitleVerticalPosition,
  subtitleFontFamily,
  onSelectSubtitleFontFamily,
  subtitleSyncOffsetSeconds,
  onSelectSubtitleSyncOffset,
  onResetSubtitleStyle,
  diagnostics,
}: PlayerSettingsModalProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [focusedControl, setFocusedControl] = useState<string | null>(null);

  const webFocusProps = (control: string) =>
    Platform.OS === "web"
      ? {
          onPointerDown: () => {
            setWebInputModality("pointer");
            setFocusedControl(null);
          },
          onFocus: (event: unknown) =>
            setFocusedControl(isFocusVisibleEvent(event) ? control : null),
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
      <View style={[styles.modalBg, { backgroundColor: playerChrome.scrim }]}>
        <View
          testID="player-settings-sheet"
          style={[
            styles.sheetContent,
            {
              backgroundColor: playerChrome.surfaceStrong,
              borderColor: playerChrome.border,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: playerChrome.text }]}>
              {t("player.settings.title")}
            </Text>
            <Pressable
              {...webFocusProps("done")}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("player.settings.done")}
              style={({ pressed }) => [
                styles.doneButton,
                pressed && { backgroundColor: playerChrome.surfacePressed },
                focusedControl === "done" &&
                  getWebFocusStyle(playerChrome.focus),
              ]}
            >
              <Text style={[styles.doneText, { color: playerChrome.text }]}>
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
                color={playerChrome.textMuted}
              />
              <Text style={[styles.sectionTitle, { color: playerChrome.text }]}>
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
                          ? playerChrome.accent + "33"
                          : playerChrome.surfaceRaised,
                      },
                      pressed && { opacity: 0.78 },
                      focusedControl === control &&
                        getWebFocusStyle(playerChrome.focus),
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
                          color: selected
                            ? playerChrome.text
                            : playerChrome.textMuted,
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
                color={playerChrome.textMuted}
              />
              <Text style={[styles.sectionTitle, { color: playerChrome.text }]}>
                {t("player.settings.audio")}
              </Text>
            </View>
            {audioTracks.length === 0 ? (
              <Text
                style={[styles.emptyText, { color: playerChrome.textMuted }]}
              >
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
                            ? playerChrome.accent + "2B"
                            : "transparent",
                        },
                        pressed && {
                          backgroundColor: playerChrome.surfacePressed,
                        },
                        focusedControl === control &&
                          getWebFocusStyle(playerChrome.focus),
                      ]}
                      onPress={() => onSelectAudio(item.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: !!item.active }}
                      accessibilityLabel={`${t("player.settings.audio")}: ${item.label}`}
                    >
                      <Text
                        style={[
                          styles.trackLabel,
                          { color: playerChrome.text },
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text
                        style={[
                          styles.trackLang,
                          { color: playerChrome.textMuted },
                        ]}
                      >
                        {[
                          item.language,
                          item.channelLayout ||
                            (item.channelCount
                              ? `${item.channelCount}ch`
                              : undefined),
                          item.codec?.toUpperCase(),
                          item.audioDescription
                            ? t("player.settings.audioDescription", {
                                defaultValue: "Audio description",
                              })
                            : item.commentary
                              ? t("player.settings.commentary", {
                                  defaultValue: "Commentary",
                                })
                              : undefined,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      {item.active && (
                        <Text
                          style={[
                            styles.checkIcon,
                            { color: playerChrome.accent },
                          ]}
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
                color={playerChrome.textMuted}
              />
              <Text style={[styles.sectionTitle, { color: playerChrome.text }]}>
                {t("player.settings.subtitles")}
              </Text>
            </View>
            {subtitles.length === 0 ? (
              <Text
                style={[styles.emptyText, { color: playerChrome.textMuted }]}
              >
                {t("player.settings.noSubtitles")}
              </Text>
            ) : (
              <>
                <Pressable
                  {...webFocusProps("subtitle-off")}
                  style={({ pressed }) => [
                    styles.trackRow,
                    subtitles.every((s) => !s.active) && {
                      backgroundColor: playerChrome.accent + "2B",
                    },
                    pressed && { backgroundColor: playerChrome.surfacePressed },
                    focusedControl === "subtitle-off" &&
                      getWebFocusStyle(playerChrome.focus),
                  ]}
                  onPress={() => onSelectSubtitle(null)}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: subtitles.every((subtitle) => !subtitle.active),
                  }}
                  accessibilityLabel={t("player.settings.off")}
                >
                  <Text
                    style={[styles.trackLabel, { color: playerChrome.text }]}
                  >
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
                              ? playerChrome.accent + "2B"
                              : "transparent",
                          },
                          pressed && {
                            backgroundColor: playerChrome.surfacePressed,
                          },
                          focusedControl === control &&
                            getWebFocusStyle(playerChrome.focus),
                        ]}
                        onPress={() => onSelectSubtitle(item.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: !!item.active }}
                        accessibilityLabel={`${t("player.settings.subtitles")}: ${item.label}`}
                      >
                        <Text
                          style={[
                            styles.trackLabel,
                            { color: playerChrome.text },
                          ]}
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={[
                            styles.trackLang,
                            { color: playerChrome.textMuted },
                          ]}
                        >
                          {[
                            item.language,
                            item.source === "torrent-file"
                              ? t("player.settings.sourceFile", {
                                  defaultValue: "File",
                                })
                              : item.source === "embedded"
                                ? t("player.settings.sourceEmbedded", {
                                    defaultValue: "Embedded",
                                  })
                                : item.source === "addon"
                                  ? t("player.settings.sourceAddon", {
                                      defaultValue: "Add-on",
                                    })
                                  : undefined,
                            item.forced
                              ? t("player.settings.forced", {
                                  defaultValue: "Forced",
                                })
                              : undefined,
                            item.hearingImpaired ? "SDH" : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        {item.active && (
                          <Text
                            style={[
                              styles.checkIcon,
                              { color: playerChrome.accent },
                            ]}
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

            <View style={[styles.sectionHeader, styles.sectionSpacing]}>
              <Ionicons
                name="options-outline"
                size={18}
                color={playerChrome.textMuted}
              />
              <Text style={[styles.sectionTitle, { color: playerChrome.text }]}>
                {t("player.settings.subtitlePreferences", {
                  defaultValue: "Subtitle preferences",
                })}
              </Text>
            </View>

            <PreferenceChoiceRow
              label={t("player.settings.subtitleMode", {
                defaultValue: "Automatic behavior",
              })}
              selected={subtitleMode}
              values={[
                {
                  value: "auto",
                  label: t("player.settings.auto", { defaultValue: "Auto" }),
                },
                {
                  value: "always",
                  label: t("player.settings.always", {
                    defaultValue: "Always",
                  }),
                },
                {
                  value: "off",
                  label: t("player.settings.off", { defaultValue: "Off" }),
                },
              ]}
              onSelect={(value) => onSelectSubtitleMode(value as SubtitleMode)}
            />
            <PreferenceChoiceRow
              label={t("player.settings.accessibility", {
                defaultValue: "SDH / accessibility",
              })}
              selected={subtitleAccessibility}
              values={[
                {
                  value: "neutral",
                  label: t("player.settings.neutral", {
                    defaultValue: "Neutral",
                  }),
                },
                {
                  value: "prefer",
                  label: t("player.settings.prefer", {
                    defaultValue: "Prefer",
                  }),
                },
                {
                  value: "avoid",
                  label: t("player.settings.avoid", {
                    defaultValue: "Avoid",
                  }),
                },
              ]}
              onSelect={(value) =>
                onSelectSubtitleAccessibility(
                  value as SubtitleAccessibilityPreference,
                )
              }
            />
            <PreferenceChoiceRow
              label={t("player.settings.textSize", {
                defaultValue: "Text size",
              })}
              selected={subtitleTextSize}
              values={[
                {
                  value: "small",
                  label: t("player.settings.small", { defaultValue: "S" }),
                },
                {
                  value: "medium",
                  label: t("player.settings.medium", { defaultValue: "M" }),
                },
                {
                  value: "large",
                  label: t("player.settings.large", { defaultValue: "L" }),
                },
              ]}
              onSelect={(value) =>
                onSelectSubtitleTextSize(value as SubtitleTextSize)
              }
            />
            <PreferenceChoiceRow
              label={t("player.settings.background", {
                defaultValue: "Background",
              })}
              selected={subtitleBackground}
              values={[
                {
                  value: "shadow",
                  label: t("player.settings.shadow", {
                    defaultValue: "Shadow",
                  }),
                },
                {
                  value: "box",
                  label: t("player.settings.box", { defaultValue: "Box" }),
                },
                {
                  value: "none",
                  label: t("player.settings.none", { defaultValue: "None" }),
                },
              ]}
              onSelect={(value) =>
                onSelectSubtitleBackground(value as SubtitleBackground)
              }
            />
            <PreferenceChoiceRow
              label={t("player.settings.backgroundOpacity", {
                defaultValue: "Background opacity",
              })}
              selected={String(Math.round(subtitleBackgroundOpacity * 100))}
              values={[0, 50, 78, 100].map((opacity) => ({
                value: String(opacity),
                label: `${opacity}%`,
              }))}
              onSelect={(value) =>
                onSelectSubtitleBackgroundOpacity(Number(value) / 100)
              }
            />
            <PreferenceChoiceRow
              label={t("player.settings.verticalPosition", {
                defaultValue: "Vertical position",
              })}
              selected={subtitleVerticalPosition}
              values={[
                {
                  value: "low",
                  label: t("player.settings.positionLow", {
                    defaultValue: "Low",
                  }),
                },
                {
                  value: "middle",
                  label: t("player.settings.positionMiddle", {
                    defaultValue: "Middle",
                  }),
                },
                {
                  value: "high",
                  label: t("player.settings.positionHigh", {
                    defaultValue: "High",
                  }),
                },
              ]}
              onSelect={(value) =>
                onSelectSubtitleVerticalPosition(
                  value as SubtitleVerticalPosition,
                )
              }
            />
            <PreferenceChoiceRow
              label={t("player.settings.font", {
                defaultValue: "Font",
              })}
              selected={subtitleFontFamily}
              values={[
                {
                  value: "system",
                  label: t("player.settings.fontSystem", {
                    defaultValue: "System",
                  }),
                },
                {
                  value: "serif",
                  label: t("player.settings.fontSerif", {
                    defaultValue: "Serif",
                  }),
                },
                {
                  value: "monospace",
                  label: t("player.settings.fontMonospace", {
                    defaultValue: "Monospace",
                  }),
                },
              ]}
              onSelect={(value) =>
                onSelectSubtitleFontFamily(value as SubtitleFontFamily)
              }
            />

            <View style={styles.preferenceGroup}>
              <Text
                style={[
                  styles.preferenceLabel,
                  { color: playerChrome.textMuted },
                ]}
              >
                {t("player.settings.sync", { defaultValue: "Subtitle sync" })}
              </Text>
              <View style={styles.preferenceChoices}>
                {[-0.5, 0, 0.5].map((delta) => {
                  const label =
                    delta === 0
                      ? `${subtitleSyncOffsetSeconds.toFixed(1)}s`
                      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}s`;
                  return (
                    <Pressable
                      key={delta}
                      accessibilityRole="button"
                      accessibilityLabel={`${t("player.settings.sync", {
                        defaultValue: "Subtitle sync",
                      })}: ${label}`}
                      onPress={() =>
                        onSelectSubtitleSyncOffset(
                          delta === 0 ? 0 : subtitleSyncOffsetSeconds + delta,
                        )
                      }
                      style={({ pressed }) => [
                        styles.preferenceChoice,
                        { backgroundColor: playerChrome.surfaceRaised },
                        pressed && { opacity: 0.78 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.preferenceChoiceText,
                          { color: playerChrome.text },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("player.settings.resetSubtitleStyle", {
                defaultValue: "Reset subtitle style",
              })}
              onPress={onResetSubtitleStyle}
              style={({ pressed }) => [
                styles.resetButton,
                {
                  borderColor: playerChrome.border,
                  backgroundColor: playerChrome.surfaceRaised,
                },
                pressed && { opacity: 0.78 },
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={playerChrome.text}
              />
              <Text style={[styles.resetText, { color: playerChrome.text }]}>
                {t("player.settings.resetSubtitleStyle", {
                  defaultValue: "Reset subtitle style",
                })}
              </Text>
            </Pressable>

            <View style={[styles.sectionHeader, styles.sectionSpacing]}>
              <Ionicons
                name="pulse-outline"
                size={18}
                color={playerChrome.textMuted}
              />
              <Text style={[styles.sectionTitle, { color: playerChrome.text }]}>
                {t("player.settings.diagnostics", {
                  defaultValue: "Playback diagnostics",
                })}
              </Text>
            </View>
            <View style={styles.diagnosticsCard}>
              {diagnostics.map((row) => (
                <View key={row.label} style={styles.diagnosticRow}>
                  <Text
                    style={[
                      styles.diagnosticLabel,
                      { color: playerChrome.textMuted },
                    ]}
                  >
                    {row.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.diagnosticValue,
                      { color: playerChrome.text },
                    ]}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
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
    borderWidth: 1,
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
  preferenceGroup: {
    marginTop: uiSpacing.md,
    gap: uiSpacing.xs,
  },
  preferenceLabel: {
    ...uiTypography.caption,
    fontWeight: "600",
  },
  preferenceChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiSpacing.xs,
  },
  preferenceChoice: {
    minHeight: uiTouchTarget,
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiSpacing.sm,
    borderRadius: uiRadii.control,
  },
  preferenceChoiceText: {
    ...uiTypography.caption,
    fontWeight: "700",
  },
  diagnosticsCard: {
    padding: uiSpacing.md,
    borderRadius: uiRadii.control,
    backgroundColor: playerChrome.surfaceRaised,
    gap: uiSpacing.xs,
  },
  resetButton: {
    minHeight: uiTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiSpacing.xs,
    borderWidth: 1,
    borderRadius: uiRadii.md,
    paddingHorizontal: uiSpacing.md,
    marginTop: uiSpacing.xs,
  },
  resetText: {
    ...uiTypography.body,
    fontWeight: "700",
  },
  diagnosticRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: uiSpacing.md,
  },
  diagnosticLabel: {
    ...uiTypography.caption,
  },
  diagnosticValue: {
    ...uiTypography.caption,
    flexShrink: 1,
    textAlign: "right",
  },
});
