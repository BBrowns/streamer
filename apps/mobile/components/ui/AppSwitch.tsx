import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { getWebFocusStyle, uiTouchTarget } from "./designSystem";

type AppSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

export function AppSwitch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
}: AppSwitchProps) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ focused, pressed }: any) => [
        styles.target,
        disabled && styles.disabled,
        pressed && styles.pressed,
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
    >
      <View
        style={[
          styles.track,
          {
            backgroundColor: value ? colors.tint : colors.surfaceElevated,
            borderColor: value ? colors.tint : colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.thumb,
            !reducedMotion && styles.thumbMotion,
            {
              backgroundColor: isDark ? colors.text : colors.card,
              transform: [{ translateX: value ? 16 : 0 }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create<Record<string, ViewStyle>>({
  target: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTouchTarget / 2,
  },
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    padding: 1,
    justifyContent: "center",
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  thumbMotion: {
    transition: "transform 160ms ease",
  } as ViewStyle,
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.42 },
});
