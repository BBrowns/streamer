import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import {
  getWebFocusStyle,
  getPrimaryForeground,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "./designSystem";

type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type AppButtonSize = "small" | "medium" | "large";

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  onFocus?: () => void;
  onHoverIn?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
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
  onFocus,
  onHoverIn,
  icon,
  accessibilityLabel,
  accessibilityHint,
  testID,
  variant = "secondary",
  size = "medium",
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: AppButtonProps) {
  const { colors } = useTheme();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";
  const foreground = isPrimary
    ? getPrimaryForeground(colors)
    : isDanger
      ? colors.error
      : colors.text;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onFocus={onFocus}
      onHoverIn={onHoverIn}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={({ pressed, focused }: any) => [
        styles.button,
        styles[size],
        fullWidth && styles.fullWidth,
        {
          backgroundColor: isPrimary
            ? colors.primary
            : isGhost
              ? "transparent"
              : isDanger
                ? colors.error + "14"
                : colors.surfaceElevated,
          borderColor: isPrimary
            ? "transparent"
            : isDanger
              ? colors.error + "33"
              : "transparent",
          opacity: disabled ? 0.48 : pressed ? 0.78 : 1,
        },
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
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
    minHeight: uiTouchTarget,
    borderRadius: uiRadii.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: uiSpacing.sm,
  },
  small: {
    minHeight: uiTouchTarget,
    paddingHorizontal: uiSpacing.md,
    paddingVertical: uiSpacing.sm,
    borderRadius: uiRadii.control,
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
    flexShrink: 1,
    textAlign: "center",
  },
  labelSmall: {
    fontSize: 12,
  },
});
