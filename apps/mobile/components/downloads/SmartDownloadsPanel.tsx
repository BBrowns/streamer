import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { hapticImpactLight } from "../../lib/haptics";
import {
  type SmartDownloadQuality,
  useSmartDownloadStore,
} from "../../stores/smartDownloadStore";
import { StatusPill } from "../ui/StatusPill";
import { Surface } from "../ui/Surface";
import { uiRadii, uiSpacing, uiTypography } from "../ui/designSystem";

const QUALITY_OPTIONS: SmartDownloadQuality[] = [
  "best",
  "1080p",
  "720p",
  "480p",
];

export function SmartDownloadsPanel({ framed = true }: { framed?: boolean }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const preferences = useSmartDownloadStore((state) => state.preferences);
  const nextEpisodePlans = useSmartDownloadStore(
    (state) => state.nextEpisodePlans,
  );
  const updatePreferences = useSmartDownloadStore(
    (state) => state.updatePreferences,
  );

  const toggleEnabled = () => {
    hapticImpactLight();
    updatePreferences({ enabled: !preferences.enabled });
  };
  const toggleNextEpisode = () => {
    hapticImpactLight();
    updatePreferences({
      autoDownloadNextEpisode: !preferences.autoDownloadNextEpisode,
    });
  };
  const toggleAutoDelete = () => {
    hapticImpactLight();
    updatePreferences({ autoDeleteWatched: !preferences.autoDeleteWatched });
  };
  const toggleWifiOnly = () => {
    hapticImpactLight();
    updatePreferences({ wifiOnly: !preferences.wifiOnly });
  };
  const plannedEpisodes = Object.values(nextEpisodePlans);

  const content = (
    <>
      <View style={styles.header}>
        <View
          style={[
            styles.iconBubble,
            {
              backgroundColor: isDark
                ? "rgba(216,180,254,0.14)"
                : "rgba(167,139,250,0.13)",
            },
          ]}
        >
          <Ionicons name="sparkles-outline" size={20} color={colors.tint} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("downloads.smart.title", { defaultValue: "Smart Downloads" })}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("downloads.smart.subtitle", {
              defaultValue:
                "Optional rules for next episodes, cleanup, quality, and storage.",
            })}
          </Text>
        </View>
        <StatusPill
          label={
            preferences.enabled
              ? t("downloads.smart.on", { defaultValue: "On" })
              : t("downloads.smart.off", { defaultValue: "Off" })
          }
          tone={preferences.enabled ? "success" : "neutral"}
        />
      </View>

      <PreferenceRow
        title={t("downloads.smart.enable", {
          defaultValue: "Enable smart downloads",
        })}
        subtitle={t("downloads.smart.enableSubtitle", {
          defaultValue:
            "Opt in before Streamer plans any automatic episode downloads.",
        })}
        value={preferences.enabled}
        onValueChange={toggleEnabled}
        accessibilityLabel="Enable smart downloads"
      />

      <PreferenceRow
        title={t("downloads.smart.nextEpisode", {
          defaultValue: "Auto-download next episode",
        })}
        subtitle={t("downloads.smart.nextEpisodeSubtitle", {
          defaultValue:
            "Plans the next unwatched episode when a series download finishes.",
        })}
        value={preferences.enabled && preferences.autoDownloadNextEpisode}
        disabled={!preferences.enabled}
        onValueChange={toggleNextEpisode}
        accessibilityLabel="Auto-download next episode"
      />

      <PreferenceRow
        title={t("downloads.smart.autoDelete", {
          defaultValue: "Auto-delete watched downloads",
        })}
        subtitle={t("downloads.smart.autoDeleteSubtitle", {
          defaultValue: "Cleanup is opt-in and never removes unverified files.",
        })}
        value={preferences.enabled && preferences.autoDeleteWatched}
        disabled={!preferences.enabled}
        onValueChange={toggleAutoDelete}
        accessibilityLabel="Auto-delete watched downloads"
      />

      <PreferenceRow
        title={t("downloads.smart.wifiOnly", { defaultValue: "Wi-Fi only" })}
        subtitle={t("downloads.smart.wifiOnlySubtitle", {
          defaultValue:
            "Mobile background downloads are platform-limited; this preference gates automatic plans.",
        })}
        value={preferences.wifiOnly}
        disabled={!preferences.enabled}
        onValueChange={toggleWifiOnly}
        accessibilityLabel="Wi-Fi only"
      />

      <View style={styles.preferenceBlock}>
        <Text style={[styles.blockLabel, { color: colors.textSecondary }]}>
          {t("downloads.smart.quality", { defaultValue: "Quality preference" })}
        </Text>
        <View style={styles.chipRow}>
          {QUALITY_OPTIONS.map((quality) => {
            const active = preferences.quality === quality;
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
                onPress={() => {
                  hapticImpactLight();
                  updatePreferences({ quality });
                }}
                disabled={!preferences.enabled}
                accessibilityRole="button"
                accessibilityLabel={`Prefer ${quality} smart downloads`}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? "#fff" : colors.text },
                  ]}
                >
                  {quality === "best" ? "Best" : quality.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.footerRow}>
        <StatusPill
          label={t("downloads.smart.storageLimit", {
            defaultValue: `${preferences.storageLimitGb} GB limit`,
            count: preferences.storageLimitGb,
          })}
          tone="info"
        />
        <StatusPill
          label={t("downloads.smart.hlsUnsupported", {
            defaultValue: "HLS offline remains unsupported",
          })}
          tone="warning"
        />
      </View>

      {plannedEpisodes.length > 0 ? (
        <View style={styles.plannedBlock}>
          <Text style={[styles.blockLabel, { color: colors.textSecondary }]}>
            {t("downloads.smart.plannedTitle", {
              defaultValue: "Planned next episodes",
            })}
          </Text>
          {plannedEpisodes.slice(0, 3).map((plan) => (
            <View key={plan.seriesId} style={styles.plannedRow}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {plan.title ||
                    t("downloads.smart.unknownSeries", {
                      defaultValue: "Series",
                    })}
                </Text>
                <Text
                  style={[styles.rowSubtitle, { color: colors.textSecondary }]}
                >
                  {`S${plan.season} E${plan.episode}${
                    plan.episodeTitle ? ` · ${plan.episodeTitle}` : ""
                  }`}
                </Text>
              </View>
              <StatusPill label={plan.status} tone="info" />
            </View>
          ))}
        </View>
      ) : null}
    </>
  );

  if (!framed) return <View style={styles.panel}>{content}</View>;

  return (
    <Surface padded={false} style={styles.panel}>
      {content}
    </Surface>
  );
}

function PreferenceRow({
  title,
  subtitle,
  value,
  disabled = false,
  onValueChange,
  accessibilityLabel,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        trackColor={{ false: "#d7d1df", true: colors.tint }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: uiRadii.lg,
    padding: uiSpacing.lg,
    gap: uiSpacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: uiSpacing.md,
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...uiTypography.title,
    fontSize: 17,
    lineHeight: 22,
  },
  subtitle: {
    ...uiTypography.caption,
    marginTop: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
    paddingTop: uiSpacing.sm,
  },
  disabled: {
    opacity: 0.58,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
  rowSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 2,
  },
  preferenceBlock: {
    gap: uiSpacing.sm,
    paddingTop: uiSpacing.xs,
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
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: uiSpacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
  },
  footerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiSpacing.sm,
  },
  plannedBlock: {
    gap: uiSpacing.sm,
    paddingTop: uiSpacing.xs,
  },
  plannedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
  },
});
