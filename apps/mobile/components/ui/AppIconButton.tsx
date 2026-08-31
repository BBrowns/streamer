import React, { useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import { getWebFocusStyle, uiRadii, uiTouchTarget } from "./designSystem";

type AppIconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: "default" | "ghost" | "danger";
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Shared icon-only action with an accessible, platform-sized target. */
export function AppIconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = "default",
  disabled = false,
  testID,
  style,
}: AppIconButtonProps) {
  const { colors } = useTheme();
  const activate = useCallback(() => onPress(), [onPress]);
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(activate);
  const foreground = variant === "danger" ? colors.error : colors.text;
  const interactionProps = disabled ? {} : webPressableProps;

  return (
    <Pressable
      {...interactionProps}
      testID={testID}
      onPress={activate}
      disabled={disabled}
      focusable={!disabled}
      {...(disabled ? { tabIndex: -1 } : {})}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ hovered, pressed }: any) => [
        styles.button,
        variant === "ghost" && styles.ghost,
        disabled && styles.disabled,
        Platform.OS === "web" &&
          hovered &&
          !disabled && { backgroundColor: colors.stateHover },
        pressed &&
          !disabled && {
            backgroundColor: colors.statePressed,
            opacity: 0.78,
          },
        Platform.OS === "web" &&
          isKeyboardFocused &&
          getWebFocusStyle(colors.focus),
        style,
      ]}
    >
      <Ionicons name={icon} size={20} color={foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    minWidth: uiTouchTarget,
    minHeight: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiRadii.control,
  },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.42 },
});
