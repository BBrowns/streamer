import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../hooks/useTheme";

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
}: Props<T>) {
  const { colors, isDark } = useTheme();

  return (
    <View
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
            style={[
              styles.btn,
              isActive && {
                backgroundColor: colors.tint + "20",
                borderColor: colors.tint,
              },
            ]}
            onPress={() => {
              onChange(opt.value);
              Haptics.selectionAsync();
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={opt.label}
          >
            {opt.emoji ? (
              <Text style={styles.emoji}>{opt.emoji}</Text>
            ) : (
              opt.icon && renderIcon && renderIcon(opt.icon, isActive)
            )}
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.tint : colors.textSecondary },
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
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  btn: {
    flex: 1,
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
  },
  emoji: {
    fontSize: 20,
  },
});
