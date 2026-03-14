import React from "react";
import { View, StyleSheet, ViewStyle, Platform, StyleProp } from "react-native";
import { Theme } from "../../constants/DesignSystem";

interface GlassPanelProps {
  children?: React.ReactNode;
  intensity?: "low" | "medium" | "high";
  style?: StyleProp<ViewStyle>;
  bordered?: boolean;
}

/**
 * Reusable GlassPanel component for the Streamer app.
 * Provides a frosted glass effect with optional borders and shadows.
 * Falls back to solid backgrounds for better platform compatibility where needed.
 */
export function GlassPanel({
  children,
  intensity = "medium",
  style,
  bordered = true,
}: GlassPanelProps) {
  const getIntensityStyle = () => {
    switch (intensity) {
      case "low":
        return { backgroundColor: "rgba(255,255,255,0.02)" };
      case "high":
        return { backgroundColor: "rgba(255,255,255,0.1)" };
      default:
        return { backgroundColor: "rgba(255,255,255,0.05)" };
    }
  };

  return (
    <View
      style={[
        styles.base,
        getIntensityStyle(),
        bordered && styles.bordered,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Theme.radius.xl,
    overflow: "hidden",
    ...Theme.shadows.glass,
  },
  bordered: {
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
});
