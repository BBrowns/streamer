import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { hapticImpactLight } from "../../lib/haptics";
import {
  PLAYBACK_QUALITY_OPTIONS,
  usePlayerStore,
} from "../../stores/playerStore";
import { SegmentedControl } from "../ui/SegmentedControl";
import {
  SettingsChoiceRow,
  SettingsMultiSelectRow,
  SettingsRowGroup,
  SettingsToggleRow,
} from "./SettingsRows";

const LANGUAGE_OPTIONS = [
  { key: "off", value: "none" },
  { key: "english", value: "en" },
  { key: "dutch", value: "nl" },
  { key: "spanish", value: "es" },
] as const;

export function PersonalizationSection() {
  const { t } = useTranslation();
  const preferredQualities = usePlayerStore(
    (state) => state.preferredQualities,
  );
  const preferredAudioLang = usePlayerStore(
    (state) => state.preferredAudioLang,
  );
  const preferredSubtitleLang = usePlayerStore(
    (state) => state.preferredSubtitleLang,
  );
  const autoPlayNext = usePlayerStore((state) => state.autoPlayNext);
  const setPreferredQualities = usePlayerStore(
    (state) => state.setPreferredQualities,
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
        <SettingsMultiSelectRow
          icon="options-outline"
          title={t("settings.playbackPreferences.quality")}
          subtitle={t("settings.playbackPreferences.qualityDescription")}
          options={PLAYBACK_QUALITY_OPTIONS.map((quality) => ({
            label: t(
              `settings.playbackPreferences.qualityOptions.${quality.slice(0, -1)}`,
            ),
            value: quality,
            disabled:
              preferredQualities.length === 1 &&
              preferredQualities.includes(quality),
          }))}
          selectedValues={preferredQualities}
          onToggle={(quality) => {
            hapticImpactLight();
            setPreferredQualities(
              preferredQualities.includes(quality)
                ? preferredQualities.filter((value) => value !== quality)
                : [...preferredQualities, quality],
            );
          }}
        />
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
