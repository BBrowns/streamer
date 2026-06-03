import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";

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
        <View
          style={[
            styles.sectionGroupContent,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {children}
        </View>
      ) : (
        <View style={styles.sectionGroupPlain}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionGroup: {
    marginBottom: 28,
  },
  sectionGroupTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
    marginBottom: 8,
    marginLeft: 8,
  },
  sectionGroupContent: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionGroupPlain: {},
});
