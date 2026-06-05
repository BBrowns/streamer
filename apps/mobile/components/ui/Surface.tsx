import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";

type SurfaceVariant = "default" | "accent" | "warning" | "plain";

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
  const backgroundColor =
    variant === "accent"
      ? "rgba(216,180,254,0.10)"
      : variant === "warning"
        ? "rgba(251, 191, 36, 0.09)"
        : variant === "plain"
          ? "transparent"
          : isDark
            ? "rgba(255,255,255,0.05)"
            : colors.card;

  return (
    <View
      style={[
        styles.surface,
        padded && styles.padded,
        { backgroundColor, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: 16,
    borderWidth: 1,
  },
  padded: {
    padding: 16,
  },
});
