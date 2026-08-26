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
  uiMotion,
  uiTypography,
} from "./designSystem";

type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type AppButtonSize = "small" | "medium" | "large";
type AppButtonTone = "default" | "onArtwork";

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  onFocus?: () => void;
  onHoverIn?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  focusColor?: string;
  testID?: string;
  variant?: AppButtonVariant;
  tone?: AppButtonTone;
  size?: AppButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function resolveAppButtonFocusColor({
  focusColor,
  onArtwork,
  themeFocus,
}: {
  focusColor?: string;
  onArtwork: boolean;
  themeFocus: string;
}) {
  return focusColor ?? (onArtwork ? "#F4F2EE" : themeFocus);
}

export function AppButton({
  label,
  onPress,
  onFocus,
  onHoverIn,
  icon,
  accessibilityLabel,
  accessibilityHint,
  focusColor,
  testID,
  variant = "secondary",
  tone = "default",
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
  const onArtwork = tone === "onArtwork";
  const foreground = isDanger
    ? colors.error
    : onArtwork
      ? isPrimary
        ? "#08090B"
        : "#F4F2EE"
      : isPrimary
        ? getPrimaryForeground(colors)
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
      style={({ hovered, pressed, focused }: any) => [
        styles.button,
        styles[size],
        fullWidth && styles.fullWidth,
        {
          backgroundColor: isPrimary
            ? onArtwork
              ? "#F4F2EE"
              : colors.primary
            : isGhost
              ? "transparent"
              : isDanger
                ? colors.error + "14"
                : onArtwork
                  ? "rgba(8,9,11,0.42)"
                  : colors.surfaceElevated,
          borderColor: isPrimary
            ? "transparent"
            : isDanger
              ? colors.error + "33"
              : "transparent",
          opacity: disabled ? 0.48 : pressed ? 0.78 : 1,
        },
        Platform.OS === "web" &&
          hovered &&
          !disabled &&
          !loading &&
          (isGhost
            ? { backgroundColor: colors.stateHover }
            : { opacity: pressed ? 0.78 : 0.92 }),
        Platform.OS === "web" &&
          focused &&
          getWebFocusStyle(
            resolveAppButtonFocusColor({
              focusColor,
              onArtwork,
              themeFocus: colors.focus,
            }),
          ),
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
    transition: `background-color ${uiMotion.feedback}ms ease, opacity ${uiMotion.feedback}ms ease`,
  } as any,
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
