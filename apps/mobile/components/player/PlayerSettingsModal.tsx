import { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { PlaybackQuality } from "@streamer/shared";
import type {
  AudioTrack,
  SubtitleTrack,
} from "../../services/streamEngine/IStreamEngine";
import type { PlaybackDiagnosticRow } from "../../services/playback/PlaybackDiagnostics";
import {
  PLAYBACK_QUALITY_OPTIONS,
  togglePreferredQuality,
  type SubtitleAccessibilityPreference,
  type SubtitleBackground,
  type SubtitleFontFamily,
  type SubtitleMode,
  type SubtitleTextSize,
  type SubtitleVerticalPosition,
} from "../../stores/playerStore";
import { AdaptiveOverlay } from "../ui/AdaptiveOverlay";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";
import { playerChrome } from "./playerChrome";

type SettingsTab = "playback" | "audio" | "subtitles";

interface PlayerSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  audioTracks: AudioTrack[];
  subtitles: SubtitleTrack[];
  onSelectAudio: (id: string | null) => void;
  onSelectSubtitle: (id: string | null) => void;
  playbackRate: number;
  onSelectPlaybackRate: (rate: number) => void;
  preferredQualities: PlaybackQuality[];
  onSelectPreferredQualities: (qualities: PlaybackQuality[]) => void;
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
  accent?: string;
  focusColor?: string;
}

interface Choice {
  value: string;
  label: string;
  accessibilityLabel?: string;
}

function ChoiceGrid({
  label,
  selected,
  values,
  onSelect,
  accent,
  focusColor,
  multiple = false,
  selectedValues = [],
}: {
  label: string;
  selected?: string;
  values: Choice[];
  onSelect: (value: string) => void;
  accent: string;
  focusColor: string;
  multiple?: boolean;
  selectedValues?: string[];
}) {
  return (
    <View style={styles.preferenceGroup}>
      <Text style={styles.preferenceLabel}>{label}</Text>
      <View
        style={styles.choiceGrid}
        accessibilityRole={multiple ? undefined : "radiogroup"}
      >
        {values.map((choice) => {
          const active = multiple
            ? selectedValues.includes(choice.value)
            : choice.value === selected;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole={multiple ? "checkbox" : "radio"}
              accessibilityState={
                multiple ? { checked: active } : { checked: active }
              }
              accessibilityLabel={`${label}: ${choice.accessibilityLabel ?? choice.label}`}
              onPress={() => onSelect(choice.value)}
              style={({ pressed, focused }: any) => [
                styles.choice,
                active && {
                  backgroundColor: `${accent}18`,
                  borderColor: `${accent}99`,
                },
                pressed && styles.pressed,
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(focusColor),
              ]}
            >
              <Text style={[styles.choiceText, active && styles.activeText]}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: string;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={17} color={playerChrome.textMuted} />
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

function TrackRow({
  label,
  metadata,
  active,
  accessibilityLabel,
  onPress,
  accent,
  focusColor,
}: {
  label: string;
  metadata?: string;
  active: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  accent: string;
  focusColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed, focused }: any) => [
        styles.trackRow,
        active && { backgroundColor: `${accent}16` },
        pressed && styles.pressed,
        Platform.OS === "web" && focused && getWebFocusStyle(focusColor),
      ]}
    >
      <View style={styles.trackCopy}>
        <Text style={styles.trackLabel}>{label}</Text>
        {metadata ? <Text style={styles.trackMetadata}>{metadata}</Text> : null}
      </View>
      {active ? <Ionicons name="checkmark" size={18} color={accent} /> : null}
    </Pressable>
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
  preferredQualities,
  onSelectPreferredQualities,
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
  accent = playerChrome.accent,
  focusColor = playerChrome.focus,
}: PlayerSettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("playback");
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    if (!visible) {
      setActiveTab("playback");
      setShowDiagnostics(false);
    }
  }, [visible]);

  const allQualitiesSelected =
    preferredQualities.length === PLAYBACK_QUALITY_OPTIONS.length;

  return (
    <AdaptiveOverlay
      visible={visible}
      onClose={onClose}
      accessibilityLabel={t("player.settings.title", {
        defaultValue: "Playback settings",
      })}
      testID="player-settings-sheet"
      materialLevel="media"
      contentStyle={[
        styles.sheet,
        {
          backgroundColor: playerChrome.surfaceStrong,
          borderColor: playerChrome.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          {showDiagnostics ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("player.settings.backToSettings", {
                defaultValue: "Back to playback settings",
              })}
              onPress={() => setShowDiagnostics(false)}
              style={({ pressed, focused }: any) => [
                styles.headerIconButton,
                pressed && styles.pressed,
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(focusColor),
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={playerChrome.text}
              />
            </Pressable>
          ) : null}
          <Text style={styles.title}>
            {showDiagnostics
              ? t("player.settings.diagnostics", {
                  defaultValue: "Playback diagnostics",
                })
              : t("player.settings.title")}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("player.settings.done")}
          style={({ pressed, focused }: any) => [
            styles.doneButton,
            pressed && styles.pressed,
            Platform.OS === "web" && focused && getWebFocusStyle(focusColor),
          ]}
        >
          <Text style={styles.doneText}>{t("player.settings.done")}</Text>
        </Pressable>
      </View>

      {showDiagnostics ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.utilityDescription}>
            {t("player.settings.diagnosticsDescription", {
              defaultValue:
                "Technical information for troubleshooting this playback session.",
            })}
          </Text>
          <View style={styles.diagnosticsCard}>
            {diagnostics.length > 0 ? (
              diagnostics.map((row) => (
                <View key={row.label} style={styles.diagnosticRow}>
                  <Text style={styles.diagnosticLabel}>{row.label}</Text>
                  <Text style={styles.diagnosticValue}>{row.value}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>
                {t("player.settings.noDiagnostics", {
                  defaultValue: "No diagnostics available.",
                })}
              </Text>
            )}
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(
              [
                [
                  "playback",
                  t("player.settings.playback", { defaultValue: "Playback" }),
                ],
                [
                  "audio",
                  t("player.settings.audioTab", { defaultValue: "Audio" }),
                ],
                ["subtitles", t("player.settings.subtitles")],
              ] as [SettingsTab, string][]
            ).map(([tab, label]) => {
              const selected = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                  onPress={() => setActiveTab(tab)}
                  style={({ pressed, focused }: any) => [
                    styles.tab,
                    selected && { borderBottomColor: accent },
                    pressed && styles.pressed,
                    Platform.OS === "web" &&
                      focused &&
                      getWebFocusStyle(focusColor),
                  ]}
                >
                  <Text style={[styles.tabText, selected && styles.activeText]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {activeTab === "playback" ? (
              <>
                <SectionTitle icon="speedometer-outline">
                  {t("player.settings.speed")}
                </SectionTitle>
                <ChoiceGrid
                  label={t("player.settings.speed")}
                  selected={String(playbackRate)}
                  values={[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({
                    value: String(rate),
                    label: `${rate}x`,
                  }))}
                  onSelect={(value) => onSelectPlaybackRate(Number(value))}
                  accent={accent}
                  focusColor={focusColor}
                />

                <SectionTitle icon="sparkles-outline">
                  {t("player.settings.quality", { defaultValue: "Quality" })}
                </SectionTitle>
                <View style={styles.preferenceGroup}>
                  <View style={styles.choiceGrid}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: allQualitiesSelected }}
                      accessibilityLabel={`${t("player.settings.quality", {
                        defaultValue: "Quality",
                      })}: ${t("player.settings.auto")}`}
                      onPress={() =>
                        onSelectPreferredQualities([
                          ...PLAYBACK_QUALITY_OPTIONS,
                        ])
                      }
                      style={({ pressed, focused }: any) => [
                        styles.choice,
                        allQualitiesSelected && {
                          backgroundColor: `${accent}18`,
                          borderColor: `${accent}99`,
                        },
                        pressed && styles.pressed,
                        Platform.OS === "web" &&
                          focused &&
                          getWebFocusStyle(focusColor),
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          allQualitiesSelected && styles.activeText,
                        ]}
                      >
                        {t("player.settings.auto")}
                      </Text>
                    </Pressable>
                    {PLAYBACK_QUALITY_OPTIONS.map((quality) => {
                      const selected = preferredQualities.includes(quality);
                      const label = quality === "2160p" ? "4K" : quality;
                      return (
                        <Pressable
                          key={quality}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={`${t("player.settings.quality", {
                            defaultValue: "Quality",
                          })}: ${label}`}
                          onPress={() =>
                            onSelectPreferredQualities(
                              togglePreferredQuality(
                                preferredQualities,
                                quality,
                              ),
                            )
                          }
                          style={({ pressed, focused }: any) => [
                            styles.choice,
                            selected && {
                              backgroundColor: `${accent}18`,
                              borderColor: `${accent}99`,
                            },
                            pressed && styles.pressed,
                            Platform.OS === "web" &&
                              focused &&
                              getWebFocusStyle(focusColor),
                          ]}
                        >
                          <Text
                            style={[
                              styles.choiceText,
                              selected && styles.activeText,
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Text style={styles.helpText}>
                  {t("player.settings.qualityNextPlayback", {
                    defaultValue:
                      "Quality changes apply to the next playback plan, not the active stream.",
                  })}
                </Text>
              </>
            ) : null}

            {activeTab === "audio" ? (
              <>
                <SectionTitle icon="volume-high-outline">
                  {t("player.settings.audio")}
                </SectionTitle>
                {audioTracks.length > 0 ? (
                  <View accessibilityRole="radiogroup">
                    {audioTracks.map((track) => (
                      <TrackRow
                        key={track.id}
                        label={track.label}
                        metadata={[
                          track.language,
                          track.channelLayout ||
                            (track.channelCount
                              ? `${track.channelCount}ch`
                              : undefined),
                          track.codec?.toUpperCase(),
                          track.audioDescription
                            ? t("player.settings.audioDescription")
                            : track.commentary
                              ? t("player.settings.commentary")
                              : undefined,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        active={Boolean(track.active)}
                        accessibilityLabel={`${t("player.settings.audio")}: ${track.label}`}
                        onPress={() => onSelectAudio(track.id)}
                        accent={accent}
                        focusColor={focusColor}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    {t("player.settings.noAudio")}
                  </Text>
                )}
              </>
            ) : null}

            {activeTab === "subtitles" ? (
              <>
                <SectionTitle icon="text-outline">
                  {t("player.settings.subtitles")}
                </SectionTitle>
                <View accessibilityRole="radiogroup">
                  <TrackRow
                    label={t("player.settings.off")}
                    active={subtitles.every((subtitle) => !subtitle.active)}
                    accessibilityLabel={t("player.settings.off")}
                    onPress={() => onSelectSubtitle(null)}
                    accent={accent}
                    focusColor={focusColor}
                  />
                  {subtitles.map((track) => (
                    <TrackRow
                      key={track.id}
                      label={track.label}
                      metadata={[
                        track.language,
                        track.source === "torrent-file"
                          ? t("player.settings.sourceFile")
                          : track.source === "embedded"
                            ? t("player.settings.sourceEmbedded")
                            : track.source === "addon"
                              ? t("player.settings.sourceAddon")
                              : undefined,
                        track.forced ? t("player.settings.forced") : undefined,
                        track.hearingImpaired ? "SDH" : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      active={Boolean(track.active)}
                      accessibilityLabel={`${t("player.settings.subtitles")}: ${track.label}`}
                      onPress={() => onSelectSubtitle(track.id)}
                      accent={accent}
                      focusColor={focusColor}
                    />
                  ))}
                </View>

                <SectionTitle icon="options-outline">
                  {t("player.settings.subtitlePreferences", {
                    defaultValue: "Subtitle preferences",
                  })}
                </SectionTitle>
                <ChoiceGrid
                  label={t("player.settings.subtitleMode", {
                    defaultValue: "Automatic behavior",
                  })}
                  selected={subtitleMode}
                  values={[
                    { value: "auto", label: t("player.settings.auto") },
                    { value: "always", label: t("player.settings.always") },
                    { value: "off", label: t("player.settings.off") },
                  ]}
                  onSelect={(value) =>
                    onSelectSubtitleMode(value as SubtitleMode)
                  }
                  accent={accent}
                  focusColor={focusColor}
                />
                <ChoiceGrid
                  label={t("player.settings.accessibility", {
                    defaultValue: "SDH / accessibility",
                  })}
                  selected={subtitleAccessibility}
                  values={[
                    { value: "neutral", label: t("player.settings.neutral") },
                    { value: "prefer", label: t("player.settings.prefer") },
                    { value: "avoid", label: t("player.settings.avoid") },
                  ]}
                  onSelect={(value) =>
                    onSelectSubtitleAccessibility(
                      value as SubtitleAccessibilityPreference,
                    )
                  }
                  accent={accent}
                  focusColor={focusColor}
                />
                <ChoiceGrid
                  label={t("player.settings.textSize", {
                    defaultValue: "Text size",
                  })}
                  selected={subtitleTextSize}
                  values={[
                    {
                      value: "small",
                      label: "S",
                      accessibilityLabel: t("player.settings.small"),
                    },
                    {
                      value: "medium",
                      label: "M",
                      accessibilityLabel: t("player.settings.medium"),
                    },
                    {
                      value: "large",
                      label: "L",
                      accessibilityLabel: t("player.settings.large"),
                    },
                  ]}
                  onSelect={(value) =>
                    onSelectSubtitleTextSize(value as SubtitleTextSize)
                  }
                  accent={accent}
                  focusColor={focusColor}
                />
                <ChoiceGrid
                  label={t("player.settings.background", {
                    defaultValue: "Background",
                  })}
                  selected={subtitleBackground}
                  values={[
                    { value: "shadow", label: t("player.settings.shadow") },
                    { value: "box", label: t("player.settings.box") },
                    { value: "none", label: t("player.settings.none") },
                  ]}
                  onSelect={(value) =>
                    onSelectSubtitleBackground(value as SubtitleBackground)
                  }
                  accent={accent}
                  focusColor={focusColor}
                />
                <ChoiceGrid
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
                  accent={accent}
                  focusColor={focusColor}
                />
                <ChoiceGrid
                  label={t("player.settings.verticalPosition", {
                    defaultValue: "Vertical position",
                  })}
                  selected={subtitleVerticalPosition}
                  values={[
                    {
                      value: "low",
                      label: t("player.settings.positionLow"),
                    },
                    {
                      value: "middle",
                      label: t("player.settings.positionMiddle"),
                    },
                    {
                      value: "high",
                      label: t("player.settings.positionHigh"),
                    },
                  ]}
                  onSelect={(value) =>
                    onSelectSubtitleVerticalPosition(
                      value as SubtitleVerticalPosition,
                    )
                  }
                  accent={accent}
                  focusColor={focusColor}
                />
                <ChoiceGrid
                  label={t("player.settings.font", { defaultValue: "Font" })}
                  selected={subtitleFontFamily}
                  values={[
                    {
                      value: "system",
                      label: t("player.settings.fontSystem"),
                    },
                    {
                      value: "serif",
                      label: t("player.settings.fontSerif"),
                    },
                    {
                      value: "monospace",
                      label: t("player.settings.fontMonospace"),
                    },
                  ]}
                  onSelect={(value) =>
                    onSelectSubtitleFontFamily(value as SubtitleFontFamily)
                  }
                  accent={accent}
                  focusColor={focusColor}
                />

                <View style={styles.preferenceGroup}>
                  <Text style={styles.preferenceLabel}>
                    {t("player.settings.sync", {
                      defaultValue: "Subtitle sync",
                    })}
                  </Text>
                  <View style={styles.choiceGrid}>
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
                              delta === 0
                                ? 0
                                : subtitleSyncOffsetSeconds + delta,
                            )
                          }
                          style={({ pressed, focused }: any) => [
                            styles.choice,
                            pressed && styles.pressed,
                            Platform.OS === "web" &&
                              focused &&
                              getWebFocusStyle(focusColor),
                          ]}
                        >
                          <Text style={styles.choiceText}>{label}</Text>
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
                  style={({ pressed, focused }: any) => [
                    styles.utilityButton,
                    pressed && styles.pressed,
                    Platform.OS === "web" &&
                      focused &&
                      getWebFocusStyle(focusColor),
                  ]}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={17}
                    color={playerChrome.text}
                  />
                  <Text style={styles.utilityButtonText}>
                    {t("player.settings.resetSubtitleStyle", {
                      defaultValue: "Reset subtitle style",
                    })}
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("player.settings.diagnostics", {
                defaultValue: "Playback diagnostics",
              })}
              onPress={() => setShowDiagnostics(true)}
              style={({ pressed, focused }: any) => [
                styles.diagnosticsLink,
                pressed && styles.pressed,
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(focusColor),
              ]}
            >
              <Ionicons
                name="pulse-outline"
                size={17}
                color={playerChrome.textMuted}
              />
              <Text style={styles.diagnosticsLinkText}>
                {t("player.settings.diagnostics", {
                  defaultValue: "Playback diagnostics",
                })}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={17}
                color={playerChrome.textDimmed}
              />
            </Pressable>
          </ScrollView>
        </>
      )}
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  sheet: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    minHeight: 56,
    paddingHorizontal: uiSpacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: playerChrome.border,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.xs,
  },
  headerIconButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiRadii.pill,
  },
  title: {
    ...uiTypography.label,
    color: playerChrome.text,
    fontSize: 16,
    lineHeight: 22,
  },
  doneButton: {
    minHeight: uiTouchTarget,
    paddingHorizontal: uiSpacing.sm,
    justifyContent: "center",
    borderRadius: uiRadii.control,
  },
  doneText: {
    ...uiTypography.control,
    color: playerChrome.text,
  },
  tabs: {
    minHeight: 46,
    flexDirection: "row",
    paddingHorizontal: uiSpacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: playerChrome.border,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: {
    ...uiTypography.caption,
    color: playerChrome.textMuted,
  },
  activeText: { color: playerChrome.text },
  scroll: { maxHeight: 540 },
  scrollContent: {
    padding: uiSpacing.lg,
    paddingBottom: uiSpacing.xxl,
    gap: uiSpacing.lg,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
    marginTop: uiSpacing.xs,
  },
  sectionTitle: {
    ...uiTypography.label,
    color: playerChrome.text,
  },
  preferenceGroup: { gap: uiSpacing.sm },
  preferenceLabel: {
    ...uiTypography.caption,
    color: playerChrome.textMuted,
  },
  choiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiSpacing.sm,
  },
  choice: {
    minWidth: 58,
    minHeight: uiTouchTarget,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.control,
    borderWidth: 1,
    borderColor: playerChrome.border,
    backgroundColor: playerChrome.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: {
    ...uiTypography.caption,
    color: playerChrome.textMuted,
  },
  pressed: { opacity: 0.76 },
  helpText: {
    ...uiTypography.caption,
    color: playerChrome.textDimmed,
  },
  trackRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: uiSpacing.md,
    paddingVertical: uiSpacing.sm,
    borderRadius: uiRadii.control,
    gap: uiSpacing.md,
  },
  trackCopy: { flex: 1, gap: uiSpacing.xs },
  trackLabel: {
    ...uiTypography.label,
    color: playerChrome.text,
  },
  trackMetadata: {
    ...uiTypography.caption,
    color: playerChrome.textMuted,
  },
  emptyText: {
    ...uiTypography.body,
    color: playerChrome.textMuted,
    paddingVertical: uiSpacing.lg,
  },
  utilityButton: {
    minHeight: uiTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiSpacing.sm,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.control,
    borderWidth: 1,
    borderColor: playerChrome.border,
    backgroundColor: playerChrome.surfaceRaised,
  },
  utilityButtonText: {
    ...uiTypography.control,
    color: playerChrome.text,
  },
  diagnosticsLink: {
    minHeight: uiTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
    marginTop: uiSpacing.sm,
    paddingTop: uiSpacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: playerChrome.border,
  },
  diagnosticsLinkText: {
    ...uiTypography.label,
    color: playerChrome.textMuted,
    flex: 1,
  },
  utilityDescription: {
    ...uiTypography.body,
    color: playerChrome.textMuted,
  },
  diagnosticsCard: {
    borderRadius: uiRadii.control,
    borderWidth: 1,
    borderColor: playerChrome.border,
    overflow: "hidden",
  },
  diagnosticRow: {
    minHeight: uiTouchTarget,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: uiSpacing.lg,
    paddingHorizontal: uiSpacing.md,
    paddingVertical: uiSpacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: playerChrome.border,
  },
  diagnosticLabel: {
    ...uiTypography.caption,
    color: playerChrome.textMuted,
  },
  diagnosticValue: {
    ...uiTypography.caption,
    color: playerChrome.text,
    textAlign: "right",
    flexShrink: 1,
  },
});
