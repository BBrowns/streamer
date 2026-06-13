import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { Surface } from "../ui/Surface";
import { uiRadii, uiSpacing, uiTypography } from "../ui/designSystem";

interface SettingsSectionProps {
  title?: string;
  children: React.ReactNode;
  framed?: boolean;
}

export function SettingsSection({
  title,
  children,
  framed = true,
}: SettingsSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionGroup}>
      {title && (
        <Text
          style={[styles.sectionGroupTitle, { color: colors.textSecondary }]}
        >
          {title.toUpperCase()}
        </Text>
      )}
      {framed ? (
        <Surface padded={false} style={styles.sectionGroupContent}>
          {children}
        </Surface>
      ) : (
        <View style={styles.sectionGroupPlain}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionGroup: {
    marginBottom: uiSpacing.xxl + uiSpacing.xs,
  },
  sectionGroupTitle: {
    ...uiTypography.sectionLabel,
    marginBottom: uiSpacing.sm,
    marginLeft: uiSpacing.sm,
  },
  sectionGroupContent: {
    borderRadius: uiRadii.md,
    overflow: "hidden",
  },
  sectionGroupPlain: {},
});
