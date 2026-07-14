import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { hapticSelection } from "../../lib/haptics";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
} from "./designSystem";

export interface FilterChipOption<T extends string | null = string> {
  label: string;
  value: T;
  icon?: string;
}

interface FilterChipBarProps<T extends string | null = string> {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  containerStyle?: object;
  accessibilityLabel?: string;
}

export function FilterChipBar<T extends string | null = string>({
  options,
  value,
  onChange,
  containerStyle,
  accessibilityLabel = "Filters",
}: FilterChipBarProps<T>) {
  const { colors, isDark } = useTheme();
  const isWeb = Platform.OS === "web";

  const handlePress = useCallback(
    (option: FilterChipOption<T>) => {
      hapticSelection();
      onChange(option.value);
    },
    [onChange],
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <ScrollView
        horizontal
        accessibilityLabel={accessibilityLabel}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <Pressable
              key={String(option.value)}
              style={({ hovered, pressed, focused }: any) => [
                styles.chip,
                {
                  backgroundColor: isActive
                    ? colors.tint
                    : isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.05)",
                  borderColor: isActive ? colors.tint : colors.border,
                },
                isWeb &&
                  hovered &&
                  !isActive && {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(0,0,0,0.1)",
                  },
                pressed && { opacity: 0.8 },
                isWeb && focused && getWebFocusStyle(colors.tint),
              ]}
              onPress={() => handlePress(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: isActive
                      ? isDark
                        ? "#000"
                        : "#fff"
                      : colors.textSecondary,
                  },
                  isActive && styles.chipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    marginTop: 8,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: uiSpacing.sm,
  },
  chip: {
    minHeight: uiTouchTarget,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: uiRadii.pill,
    borderWidth: 1,
    // @ts-ignore web-only
    transition: "background-color 0.15s ease",
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  chipTextActive: {
    fontWeight: "800",
  },
});
