import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { uiRadii, uiSpacing, uiTypography } from "./designSystem";

type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type AppButtonSize = "small" | "medium" | "large";

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  onPress,
  icon,
  accessibilityLabel,
  variant = "secondary",
  size = "medium",
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: AppButtonProps) {
  const { colors, isDark } = useTheme();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";
  const foreground = isPrimary
    ? isDark
      ? "#000"
      : "#fff"
    : isDanger
      ? colors.error
      : colors.tint;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.button,
        styles[size],
        fullWidth && styles.fullWidth,
        {
          backgroundColor: isPrimary
            ? colors.tint
            : isGhost
              ? "transparent"
              : isDanger
                ? colors.error + "14"
                : colors.card,
          borderColor: isPrimary
            ? colors.tint
            : isDanger
              ? colors.error + "33"
              : colors.border,
          opacity: disabled ? 0.48 : pressed ? 0.78 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : icon ? (
        <Ionicons
          name={icon}
          size={size === "small" ? 15 : 17}
          color={foreground}
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          size === "small" && styles.labelSmall,
          { color: foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: uiRadii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: uiSpacing.sm,
  },
  small: {
    minHeight: 36,
    paddingHorizontal: uiSpacing.md,
    paddingVertical: uiSpacing.sm,
    borderRadius: uiRadii.lg,
  },
  medium: {
    paddingHorizontal: uiSpacing.lg,
    paddingVertical: uiSpacing.md,
  },
  large: {
    minHeight: 52,
    paddingHorizontal: uiSpacing.xl,
    paddingVertical: uiSpacing.lg,
  },
  fullWidth: {
    flex: 1,
  },
  label: {
    ...uiTypography.control,
  },
  labelSmall: {
    fontSize: 12,
  },
});
