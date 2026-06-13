import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { AppButton } from "./AppButton";
import { StatusPill } from "./StatusPill";
import { Surface } from "./Surface";
import { getSoftOverlayColor, uiSpacing, uiTypography } from "./designSystem";

type PlaybackStatusTone = "loading" | "warning" | "error";

type PlaybackStatusAction = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: keyof typeof Ionicons.glyphMap;
};

type PlaybackStatusPanelProps = {
  tone?: PlaybackStatusTone;
  statusLabel?: string;
  title: string;
  message?: string | null;
  detail?: string | null;
  loading?: boolean;
  actions?: PlaybackStatusAction[];
};

export function PlaybackStatusPanel({
  tone = "loading",
  statusLabel,
  title,
  message,
  detail,
  loading = false,
  actions = [],
}: PlaybackStatusPanelProps) {
  const { colors, isDark } = useTheme();
  const statusTone =
    tone === "error" ? "error" : tone === "warning" ? "warning" : "info";
  const iconName =
    tone === "error"
      ? "alert-circle-outline"
      : tone === "warning"
        ? "swap-horizontal-outline"
        : "play-circle-outline";

  return (
    <View
      style={[styles.overlay, { backgroundColor: getSoftOverlayColor(isDark) }]}
    >
      <Surface style={styles.panel}>
        <View style={styles.iconShell}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.tint} />
          ) : (
            <Ionicons
              name={iconName}
              size={34}
              color={tone === "error" ? colors.error : colors.tint}
            />
          )}
        </View>
        <StatusPill
          label={
            statusLabel ||
            (tone === "error"
              ? "Needs attention"
              : tone === "warning"
                ? "Trying fallback"
                : "Preparing")
          }
          tone={statusTone}
        />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {!!message && (
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>
        )}
        {!!detail && (
          <Text style={[styles.detail, { color: colors.textSecondary }]}>
            {detail}
          </Text>
        )}
        {actions.length > 0 && (
          <View style={styles.actions}>
            {actions.map((action) => (
              <AppButton
                key={action.label}
                label={action.label}
                icon={action.icon}
                variant={action.variant ?? "secondary"}
                onPress={action.onPress}
                size="medium"
                style={styles.actionButton}
              />
            ))}
          </View>
        )}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
    padding: uiSpacing.xxl,
  },
  panel: {
    width: "100%",
    maxWidth: 440,
    alignItems: "center",
    gap: uiSpacing.md,
  },
  iconShell: {
    minHeight: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...uiTypography.title,
    textAlign: "center",
  },
  message: {
    ...uiTypography.body,
    textAlign: "center",
    maxWidth: 340,
  },
  detail: {
    ...uiTypography.caption,
    textAlign: "center",
    maxWidth: 340,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: uiSpacing.sm + 2,
    marginTop: uiSpacing.xs,
  },
  actionButton: {
    minWidth: 128,
  },
});
