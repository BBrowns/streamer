import type { ComponentProps } from "react";
import { Platform, Pressable, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  getWebAriaChecked,
  getWebFocusStyle,
  uiMotion,
  uiTouchTarget,
} from "./designSystem";

type AppSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
};

type ViewStyleProp = ComponentProps<typeof View>["style"];

export function AppSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  testID,
}: AppSwitchProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      {...getWebAriaChecked(value)}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ focused, hovered, pressed }: any) => [
        styles.target,
        disabled && styles.disabled,
        hovered && !disabled && { backgroundColor: colors.stateHover },
        pressed && !disabled && { backgroundColor: colors.statePressed },
        pressed && styles.pressed,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <View
        testID={testID ? `${testID}-track` : undefined}
        style={[
          styles.track,
          {
            backgroundColor: value ? colors.text : colors.surfaceElevated,
            borderColor: value ? colors.text : colors.border,
          },
        ]}
      >
        <View
          testID={testID ? `${testID}-thumb` : undefined}
          style={[
            styles.thumb,
            !reducedMotion && styles.thumbMotion,
            {
              backgroundColor: value
                ? isDark
                  ? colors.background
                  : colors.card
                : isDark
                  ? colors.text
                  : colors.card,
              transform: [{ translateX: value ? 16 : 0 }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = {
  target: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTouchTarget / 2,
  } satisfies ViewStyleProp,
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    padding: 1,
    justifyContent: "center",
  } satisfies ViewStyleProp,
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  } satisfies ViewStyleProp,
  thumbMotion: {
    transition: `transform ${uiMotion.feedback}ms ease`,
    // This CSS shorthand is web-only; the native ViewStyle type omits it.
  } as unknown as ViewStyleProp,
  pressed: { opacity: 0.72 } satisfies ViewStyleProp,
  disabled: { opacity: 0.42 } satisfies ViewStyleProp,
} satisfies Record<string, ViewStyleProp>;
