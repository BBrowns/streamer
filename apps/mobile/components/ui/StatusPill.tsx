import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

type StatusTone = "success" | "warning" | "error" | "neutral" | "info";

type StatusPillProps = {
  label: string;
  tone?: StatusTone;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function StatusPill({ label, tone = "neutral", icon }: StatusPillProps) {
  const { colors } = useTheme();
  const toneColor =
    tone === "success"
      ? colors.success
      : tone === "warning"
        ? colors.warning
        : tone === "error"
          ? colors.error
          : tone === "info"
            ? colors.tint
            : colors.textSecondary;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: `${toneColor}20`,
          borderColor: `${toneColor}55`,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={13} color={toneColor} /> : null}
      <Text numberOfLines={1} style={[styles.label, { color: toneColor }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
  },
});
