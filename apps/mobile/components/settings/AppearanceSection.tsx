import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { SegmentedControl } from "../ui/SegmentedControl";

export function AppearanceSection() {
  const { theme, setTheme } = useAuthStore();
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
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
});
