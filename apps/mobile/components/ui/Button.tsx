import React from "react";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  Platform,
} from "react-native";
import { Theme } from "../../constants/DesignSystem";

interface ButtonProps {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  style?: ViewStyle;
}

/**
 * Reusable and themeable Button component for the Streamer app.
 * Ensures consistent cross-platform styling and resolves background rendering issues on Web.
 */
export function Button({
  title,
  onPress,
  isLoading = false,
  disabled = false,
  variant = "primary",
  size = "md",
  style,
}: ButtonProps) {
  const isDisableMode = disabled || isLoading;

  // Determine colors based on variant
  const getColors = () => {
    switch (variant) {
      case "secondary":
        return {
          bg: Theme.colors.secondary,
          text: Theme.colors.white || "#ffffff",
          shadow: Theme.shadows.secondary,
        };
      case "danger":
        return {
          bg: Theme.colors.error,
          text: "#ffffff",
          shadow: {},
        };
      case "ghost":
        return {
          bg: "rgba(255,255,255,0.05)",
          text: "#ffffff",
          shadow: {},
        };
      default:
        return {
          bg: Theme.colors.primary,
          text: Theme.colors.black,
          shadow: Theme.shadows.primary,
        };
    }
  };

  const { bg, text, shadow } = getColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisableMode}
      style={({ pressed }) => [
        styles.base,
        size === "sm" && styles.sm,
        size === "lg" && styles.lg,
        { backgroundColor: bg },
        variant === "ghost" && styles.ghostBorder,
        !disabled && shadow,
        style,
        pressed && styles.pressed,
        isDisableMode && styles.disabled,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator
          color={variant === "primary" ? "#000000" : "#ffffff"}
        />
      ) : (
        <Text
          style={[
            styles.text,
            { color: text },
            size === "sm" && styles.textSm,
            size === "lg" && styles.textLg,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  sm: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    minHeight: 36,
  },
  lg: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 20,
    minHeight: 56,
  },
  text: {
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  textSm: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  textLg: {
    fontSize: 18,
    letterSpacing: 2,
  },
  ghostBorder: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
