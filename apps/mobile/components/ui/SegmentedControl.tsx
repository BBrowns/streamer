import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../hooks/useTheme";
import {
  getWebAriaChecked,
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
} from "./designSystem";

export type SegmentOption<T extends string = string> = {
  label: string;
  value: T;
  /** Ionicons icon name */
  icon?: string;
  /** Emoji character displayed instead of icon */
  emoji?: string;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Render an Ionicons icon if provided. Requires calling component to import Ionicons. */
  renderIcon?: (name: string, active: boolean) => React.ReactNode;
  accessibilityLabel?: string;
};

/**
 * A reusable segmented selector with theme-aware highlight and built-in haptics.
 *
 * @example
 * <SegmentedControl
 *   options={[{ label: "Light", value: "light", icon: "sunny-outline" }]}
 *   value={theme}
 *   onChange={setTheme}
 *   renderIcon={(name, active) => <Ionicons name={name as any} size={20} color={active ? colors.tint : colors.textSecondary} />}
 * />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  renderIcon,
  accessibilityLabel,
}: Props<T>) {
  const { colors, isDark } = useTheme();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.grid,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={({ pressed, focused }: any) => [
              styles.btn,
              isActive && {
                backgroundColor: colors.tint + "20",
                borderColor: colors.tint,
              },
              pressed && styles.pressed,
              Platform.OS === "web" && focused && getWebFocusStyle(colors.tint),
            ]}
            onPress={() => {
              onChange(opt.value);
              Haptics.selectionAsync();
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={opt.label}
            {...getWebAriaChecked(isActive)}
          >
            {opt.emoji ? (
              <Text style={styles.emoji}>{opt.emoji}</Text>
            ) : (
              opt.icon && renderIcon && renderIcon(opt.icon, isActive)
            )}
            <Text
              numberOfLines={2}
              style={[
                styles.label,
                { color: isActive ? colors.text : colors.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    padding: uiSpacing.sm,
    borderRadius: uiRadii.md,
    borderWidth: 1,
    gap: uiSpacing.sm,
  },
  btn: {
    flex: 1,
    minWidth: 0,
    minHeight: uiTouchTarget,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  emoji: {
    fontSize: 20,
  },
  pressed: {
    opacity: 0.78,
  },
});
