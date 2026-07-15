import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { hapticImpactLight } from "../../lib/haptics";
import {
  type SmartDownloadQuality,
  useSmartDownloadStore,
} from "../../stores/smartDownloadStore";
import { SegmentedControl } from "../ui/SegmentedControl";
import {
  SettingsChoiceRow,
  SettingsRowGroup,
  SettingsToggleRow,
} from "./SettingsRows";

const QUALITY_OPTIONS: SmartDownloadQuality[] = [
  "best",
  "1080p",
  "720p",
  "480p",
];
const STORAGE_OPTIONS = [5, 10, 25, 50] as const;

export function DownloadsSettingsSection() {
  const { t } = useTranslation();
  const preferences = useSmartDownloadStore((state) => state.preferences);
  const updatePreferences = useSmartDownloadStore(
    (state) => state.updatePreferences,
  );

  const update = (change: Partial<typeof preferences>) => {
    hapticImpactLight();
    updatePreferences(change);
  };

  return (
    <View style={styles.stack}>
      <SettingsRowGroup>
        <SettingsToggleRow
          icon="sparkles-outline"
          title={t("settings.downloadPreferences.smartDownloads")}
          subtitle={t("settings.downloadPreferences.smartDownloadsDescription")}
          value={preferences.enabled}
          onValueChange={(enabled) => update({ enabled })}
        />
        <SettingsToggleRow
          icon="play-skip-forward-outline"
          title={t("settings.downloadPreferences.nextEpisode")}
          subtitle={t("settings.downloadPreferences.nextEpisodeDescription")}
          value={preferences.enabled && preferences.autoDownloadNextEpisode}
          disabled={!preferences.enabled}
          onValueChange={(autoDownloadNextEpisode) =>
            update({ autoDownloadNextEpisode })
          }
        />
        <SettingsToggleRow
          icon="wifi-outline"
          title={t("settings.downloadPreferences.wifiOnly")}
          subtitle={t("settings.downloadPreferences.wifiOnlyDescription")}
          value={preferences.wifiOnly}
          disabled={!preferences.enabled}
          onValueChange={(wifiOnly) => update({ wifiOnly })}
        />
        <SettingsToggleRow
          icon="trash-bin-outline"
          title={t("settings.downloadPreferences.cleanup")}
          subtitle={t("settings.downloadPreferences.cleanupDescription")}
          value={preferences.enabled && preferences.autoDeleteWatched}
          disabled={!preferences.enabled}
          onValueChange={(autoDeleteWatched) => update({ autoDeleteWatched })}
        />
        <SettingsChoiceRow
          icon="options-outline"
          title={t("settings.downloadPreferences.quality")}
          subtitle={t("settings.downloadPreferences.qualityDescription")}
        >
          <SegmentedControl
            options={QUALITY_OPTIONS.map((quality) => ({
              label:
                quality === "best"
                  ? t("settings.downloadPreferences.best")
                  : quality.toUpperCase(),
              value: quality,
            }))}
            value={preferences.quality}
            onChange={(quality) => update({ quality })}
          />
        </SettingsChoiceRow>
        <SettingsChoiceRow
          icon="server-outline"
          title={t("settings.downloadPreferences.storageLimit")}
          subtitle={t("settings.downloadPreferences.storageLimitDescription")}
        >
          <SegmentedControl
            options={STORAGE_OPTIONS.map((storageLimitGb) => ({
              label: `${storageLimitGb} GB`,
              value: String(storageLimitGb),
            }))}
            value={String(preferences.storageLimitGb)}
            onChange={(value) => update({ storageLimitGb: Number(value) })}
            accessibilityLabel={t("settings.downloadPreferences.storageLimit")}
          />
        </SettingsChoiceRow>
      </SettingsRowGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
});
