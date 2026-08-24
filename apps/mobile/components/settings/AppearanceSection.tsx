import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SettingsRowGroup, SettingsToggleRow } from "./SettingsRows";

export function AppearanceSection() {
  const {
    theme,
    setTheme,
    dynamicArtworkColor,
    setDynamicArtworkColor,
    forceReducedMotion,
    setForceReducedMotion,
  } = useAuthStore();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const options = [
    {
      label: t("settings.theme.light"),
      value: "light" as const,
      icon: "sunny-outline",
    },
    {
      label: t("settings.theme.dark"),
      value: "dark" as const,
      icon: "moon-outline",
    },
    {
      label: t("settings.theme.system"),
      value: "system" as const,
      icon: "contrast-outline",
    },
  ];

  return (
    <View style={styles.section}>
      <SegmentedControl
        options={options}
        value={theme}
        onChange={setTheme}
        renderIcon={(name, active) => (
          <Ionicons
            name={name as any}
            size={20}
            color={active ? colors.tint : colors.textSecondary}
          />
        )}
      />
      <SettingsRowGroup>
        <SettingsToggleRow
          icon="color-palette-outline"
          title={t("settings.appearance.dynamicArtworkColor", {
            defaultValue: "Dynamic artwork colour",
          })}
          subtitle={t("settings.appearance.dynamicArtworkColorDescription", {
            defaultValue:
              "Subtly adapt ambience and focus colour to the current artwork.",
          })}
          value={dynamicArtworkColor}
          onValueChange={setDynamicArtworkColor}
        />
        <SettingsToggleRow
          icon="accessibility-outline"
          title={t("settings.appearance.forceReducedMotion", {
            defaultValue: "Always reduce motion",
          })}
          subtitle={t("settings.appearance.forceReducedMotionDescription", {
            defaultValue:
              "Replace spatial motion with immediate or short opacity feedback.",
          })}
          value={forceReducedMotion}
          onValueChange={setForceReducedMotion}
        />
      </SettingsRowGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
    gap: 16,
  },
});
