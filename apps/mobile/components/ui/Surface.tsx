import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { getSurfaceColors, uiRadii, uiSpacing } from "./designSystem";

type SurfaceVariant = "default" | "accent" | "warning" | "danger" | "plain";

type SurfaceProps = {
  children: React.ReactNode;
  variant?: SurfaceVariant;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Surface({
  children,
  variant = "default",
  padded = true,
  style,
}: SurfaceProps) {
  const { colors, isDark } = useTheme();
  const surfaceColors = getSurfaceColors(colors, isDark, variant);

  return (
    <View
      style={[styles.surface, padded && styles.padded, surfaceColors, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: uiRadii.md,
    borderWidth: 1,
  },
  padded: {
    padding: uiSpacing.lg,
  },
});
