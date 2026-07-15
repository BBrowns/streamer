import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { hapticImpactLight } from "../../lib/haptics";
import { usePlayerStore } from "../../stores/playerStore";
import { SegmentedControl } from "../ui/SegmentedControl";
import {
  SettingsChoiceRow,
  SettingsRowGroup,
  SettingsToggleRow,
} from "./SettingsRows";

type PlaybackQuality = "auto" | "1080p" | "720p" | "480p";

const QUALITY_OPTIONS: PlaybackQuality[] = ["auto", "1080p", "720p", "480p"];
const LANGUAGE_OPTIONS = [
  { key: "off", value: "none" },
  { key: "english", value: "en" },
  { key: "dutch", value: "nl" },
  { key: "spanish", value: "es" },
] as const;

export function PersonalizationSection() {
  const { t } = useTranslation();
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

  const languageOptions = LANGUAGE_OPTIONS.map((option) => ({
    label: t(`settings.playbackPreferences.languages.${option.key}`),
    value: option.value,
  }));

  return (
    <View style={styles.stack}>
      <SettingsRowGroup>
        <SettingsChoiceRow
          icon="options-outline"
          title={t("settings.playbackPreferences.quality")}
          subtitle={t("settings.playbackPreferences.qualityDescription")}
        >
          <SegmentedControl
            options={QUALITY_OPTIONS.map((quality) => ({
              label:
                quality === "auto"
                  ? t("settings.playbackPreferences.auto")
                  : quality.toUpperCase(),
              value: quality,
            }))}
            value={preferredQuality}
            onChange={(quality) => {
              hapticImpactLight();
              setPreferredQuality(quality);
            }}
          />
        </SettingsChoiceRow>
        <SettingsChoiceRow
          icon="volume-medium-outline"
          title={t("settings.playbackPreferences.audio")}
          subtitle={t("settings.playbackPreferences.audioDescription")}
        >
          <SegmentedControl
            options={languageOptions}
            value={preferredAudioLang ?? "none"}
            onChange={(language) => {
              hapticImpactLight();
              setPreferredAudioLang(language === "none" ? null : language);
            }}
          />
        </SettingsChoiceRow>
        <SettingsChoiceRow
          icon="text-outline"
          title={t("settings.playbackPreferences.subtitles")}
          subtitle={t("settings.playbackPreferences.subtitlesDescription")}
        >
          <SegmentedControl
            options={languageOptions}
            value={preferredSubtitleLang ?? "none"}
            onChange={(language) => {
              hapticImpactLight();
              setPreferredSubtitleLang(language === "none" ? null : language);
            }}
          />
        </SettingsChoiceRow>
        <SettingsToggleRow
          icon="play-skip-forward-outline"
          title={t("settings.playbackPreferences.autoplay")}
          subtitle={t("settings.playbackPreferences.autoplayDescription")}
          value={autoPlayNext}
          onValueChange={(enabled) => {
            hapticImpactLight();
            setAutoPlayNext(enabled);
          }}
        />
      </SettingsRowGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
});
