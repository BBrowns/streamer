import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpactLight } from "../../lib/haptics";
import { usePlayerStore } from "../../stores/playerStore";
import { StatusPill } from "../ui/StatusPill";
import { Surface } from "../ui/Surface";
import { uiRadii, uiSpacing, uiTypography } from "../ui/designSystem";

type PlaybackQuality = "auto" | "1080p" | "720p" | "480p";

const QUALITY_OPTIONS: PlaybackQuality[] = ["auto", "1080p", "720p", "480p"];
const LANGUAGE_OPTIONS = [
  { label: "Off", value: null },
  { label: "EN", value: "en" },
  { label: "NL", value: "nl" },
  { label: "ES", value: "es" },
] as const;

export function PersonalizationSection({
  framed = true,
}: {
  framed?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const preferredQuality = usePlayerStore((state) => state.preferredQuality);
  const preferredAudioLang = usePlayerStore(
    (state) => state.preferredAudioLang,
  );
  const preferredSubtitleLang = usePlayerStore(
    (state) => state.preferredSubtitleLang,
  );
  const autoPlayNext = usePlayerStore((state) => state.autoPlayNext);
  const setPreferredQuality = usePlayerStore(
    (state) => state.setPreferredQuality,
  );
  const setPreferredAudioLang = usePlayerStore(
    (state) => state.setPreferredAudioLang,
  );
  const setPreferredSubtitleLang = usePlayerStore(
    (state) => state.setPreferredSubtitleLang,
  );
  const setAutoPlayNext = usePlayerStore((state) => state.setAutoPlayNext);

  const setQuality = (quality: PlaybackQuality) => {
    hapticImpactLight();
    setPreferredQuality(quality);
  };

  const content = (
    <>
      <View style={styles.header}>
        <View
          style={[
            styles.iconBubble,
            {
              backgroundColor: isDark
                ? "rgba(52,211,153,0.14)"
                : "rgba(16,185,129,0.12)",
            },
          ]}
        >
          <Ionicons name="person-circle-outline" size={20} color="#34d399" />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("settings.personalization.title", {
              defaultValue: "Personalization",
            })}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("settings.personalization.subtitle", {
              defaultValue:
                "Local playback preferences for source choice and episodes.",
            })}
          </Text>
        </View>
        <StatusPill
          label={t("settings.personalization.localOnly", {
            defaultValue: "Local preferences only",
          })}
          tone="info"
        />
      </View>

      <View style={styles.preferenceBlock}>
        <Text style={[styles.blockLabel, { color: colors.textSecondary }]}>
          {t("settings.personalization.quality", {
            defaultValue: "Playback quality",
          })}
        </Text>
        <View style={styles.chipRow}>
          {QUALITY_OPTIONS.map((quality) => {
            const active = preferredQuality === quality;
            return (
              <Pressable
                key={quality}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? colors.tint : colors.border,
                    backgroundColor: active
                      ? colors.tint
                      : isDark
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(0,0,0,0.035)",
                  },
                ]}
                onPress={() => setQuality(quality)}
                accessibilityRole="button"
                accessibilityLabel={`Prefer ${quality} playback`}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? "#fff" : colors.text },
                  ]}
                >
                  {quality === "auto" ? "Auto" : quality.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          {t("settings.personalization.qualityHint", {
            defaultValue:
              "Play Best uses this as a maximum quality when ranking sources.",
          })}
        </Text>
      </View>

      <LanguagePreference
        label={t("settings.personalization.subtitles", {
          defaultValue: "Subtitles",
        })}
        selected={preferredSubtitleLang}
        onSelect={setPreferredSubtitleLang}
        accessibilityPrefix="Prefer"
        accessibilitySuffix="subtitles"
      />

      <LanguagePreference
        label={t("settings.personalization.audio", {
          defaultValue: "Audio language",
        })}
        selected={preferredAudioLang}
        onSelect={setPreferredAudioLang}
        accessibilityPrefix="Prefer"
        accessibilitySuffix="audio"
      />

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            {t("settings.personalization.autoplay", {
              defaultValue: "Autoplay next episode",
            })}
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
            {t("settings.personalization.autoplaySubtitle", {
              defaultValue:
                "Keeps series playback moving when the next episode is known.",
            })}
          </Text>
        </View>
        <Switch
          value={autoPlayNext}
          onValueChange={(enabled) => {
            hapticImpactLight();
            setAutoPlayNext(enabled);
          }}
          trackColor={{
            false: isDark ? "#374151" : "#e2e8f0",
            true: colors.tint,
          }}
          thumbColor={autoPlayNext ? "#fff" : "#f1f5f9"}
          accessibilityLabel="Autoplay next episode"
        />
      </View>
    </>
  );

  if (!framed) return <View style={styles.panel}>{content}</View>;

  return (
    <Surface padded={false} style={styles.panel}>
      {content}
    </Surface>
  );
}

function LanguagePreference({
  label,
  selected,
  onSelect,
  accessibilityPrefix,
  accessibilitySuffix,
}: {
  label: string;
  selected: string | null;
  onSelect: (language: string | null) => void;
  accessibilityPrefix: string;
  accessibilitySuffix: string;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.preferenceBlock}>
      <Text style={[styles.blockLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <View style={styles.chipRow}>
        {LANGUAGE_OPTIONS.map((language) => {
          const active = selected === language.value;
          return (
            <Pressable
              key={language.label}
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.tint : colors.border,
                  backgroundColor: active
                    ? colors.tint
                    : isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.035)",
                },
              ]}
              onPress={() => {
                hapticImpactLight();
                onSelect(language.value);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${accessibilityPrefix} ${language.label === "Off" ? "no" : language.label === "NL" ? "Dutch" : language.label === "EN" ? "English" : "Spanish"} ${accessibilitySuffix}`}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#fff" : colors.text },
                ]}
              >
                {language.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: uiSpacing.lg,
    gap: uiSpacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: uiSpacing.md,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: uiRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: uiSpacing.xs,
  },
  title: {
    ...uiTypography.title,
    fontSize: 18,
  },
  subtitle: {
    ...uiTypography.body,
    lineHeight: 20,
  },
  preferenceBlock: {
    gap: uiSpacing.sm,
  },
  blockLabel: {
    ...uiTypography.sectionLabel,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiSpacing.sm,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: uiSpacing.md,
    borderRadius: uiRadii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    ...uiTypography.control,
  },
  helperText: {
    ...uiTypography.caption,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
  rowText: {
    flex: 1,
    gap: uiSpacing.xs,
  },
  rowTitle: {
    ...uiTypography.body,
  },
  rowSubtitle: {
    ...uiTypography.caption,
    lineHeight: 18,
  },
});
