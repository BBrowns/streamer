import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { useSmartDownloadStore } from "../../stores/smartDownloadStore";
import { StatusPill } from "../ui/StatusPill";
import { Surface } from "../ui/Surface";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";

const PLAN_STATUS_DEFAULTS = {
  planned: "Planned",
  queued: "Queued",
  downloaded: "Downloaded",
  blocked: "Blocked",
  skipped: "Skipped",
} as const;

export function SmartDownloadsStatusRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const preferences = useSmartDownloadStore((state) => state.preferences);
  const plannedCount = useSmartDownloadStore(
    (state) => Object.keys(state.nextEpisodePlans).length,
  );

  return (
    <Pressable
      style={({ pressed, focused }: any) => [
        styles.statusRow,
        { borderColor: colors.border },
        pressed && { opacity: 0.76 },
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("downloads.smart.manage", {
        defaultValue: "Manage Smart Downloads settings",
      })}
    >
      <Ionicons name="sparkles-outline" size={19} color={colors.tint} />
      <View style={styles.statusCopy}>
        <Text style={[styles.statusTitle, { color: colors.text }]}>
          {t("downloads.smart.title", { defaultValue: "Smart Downloads" })}
        </Text>
        <Text style={[styles.statusSubtitle, { color: colors.textSecondary }]}>
          {plannedCount > 0
            ? t("downloads.smart.plannedCount", {
                count: plannedCount,
                defaultValue: `${plannedCount} next episodes planned`,
              })
            : t("downloads.smart.manageSubtitle", {
                defaultValue:
                  "Next episode, Wi-Fi, quality, and cleanup preferences",
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
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

export function SmartDownloadPlans() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const nextEpisodePlans = useSmartDownloadStore(
    (state) => state.nextEpisodePlans,
  );
  const plans = useMemo(
    () => Object.values(nextEpisodePlans),
    [nextEpisodePlans],
  );
  if (plans.length === 0) return null;

  return (
    <Surface padded={false} style={styles.plans}>
      <Text style={[styles.plansTitle, { color: colors.text }]}>
        {t("downloads.smart.plannedTitle", {
          defaultValue: "Planned next episodes",
        })}
      </Text>
      {plans.map((plan, index) => (
        <View
          key={plan.seriesId}
          style={[
            styles.planRow,
            index > 0 && {
              borderTopColor: colors.border,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <View style={styles.statusCopy}>
            <Text style={[styles.planTitle, { color: colors.text }]}>
              {plan.title ||
                t("downloads.smart.unknownSeries", { defaultValue: "Series" })}
            </Text>
            <Text
              style={[styles.statusSubtitle, { color: colors.textSecondary }]}
            >
              {`S${plan.season} E${plan.episode}${
                plan.episodeTitle ? ` · ${plan.episodeTitle}` : ""
              }`}
            </Text>
          </View>
          <StatusPill
            label={t(`downloads.smart.planStatus.${plan.status}`, {
              defaultValue: PLAN_STATUS_DEFAULTS[plan.status],
            })}
            tone="info"
          />
        </View>
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    minHeight: uiTouchTarget + 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
    paddingHorizontal: uiSpacing.sm,
    paddingVertical: uiSpacing.md,
    borderRadius: uiRadii.control,
  },
  statusCopy: { flex: 1, minWidth: 0 },
  statusTitle: { ...uiTypography.label },
  statusSubtitle: { ...uiTypography.caption, marginTop: uiSpacing.xxs },
  plans: {
    marginTop: uiSpacing.lg,
    borderRadius: uiRadii.card,
    overflow: "hidden",
  },
  plansTitle: {
    ...uiTypography.title,
    fontSize: 18,
    lineHeight: 24,
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.md,
  },
  planRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.md,
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.md,
  },
  planTitle: { ...uiTypography.label },
});
