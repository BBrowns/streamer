import React, { useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
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
  loading?: boolean;
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
  loading = false,
  testID,
  style,
}: AppIconButtonProps) {
  const { colors } = useTheme();
  const activate = useCallback(() => onPress(), [onPress]);
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(activate);
  const foreground = variant === "danger" ? colors.error : colors.text;
  const inactive = disabled || loading;
  const interactionProps = inactive ? {} : webPressableProps;

  return (
    <Pressable
      {...interactionProps}
      testID={testID}
      onPress={activate}
      disabled={inactive}
      focusable={!inactive}
      {...(inactive ? { tabIndex: -1 } : {})}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ hovered, pressed }: any) => [
        styles.button,
        variant === "ghost" && styles.ghost,
        inactive && styles.disabled,
        Platform.OS === "web" &&
          hovered &&
          !inactive && { backgroundColor: colors.stateHover },
        pressed &&
          !inactive && {
            backgroundColor: colors.statePressed,
            opacity: 0.78,
          },
        Platform.OS === "web" &&
          isKeyboardFocused &&
          getWebFocusStyle(colors.focus),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <Ionicons name={icon} size={20} color={foreground} />
      )}
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
