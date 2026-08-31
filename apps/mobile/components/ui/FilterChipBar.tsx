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
import { useUiMotion } from "../../hooks/useUiMotion";
import { hapticSelection } from "../../lib/haptics";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
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
  const { colors } = useTheme();
  const isWeb = Platform.OS === "web";
  const { duration } = useUiMotion();
  const feedbackDuration = duration("feedback");

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
                    ? colors.stateSelected
                    : "transparent",
                  borderColor: isActive
                    ? colors.borderStrong
                    : colors.borderSubtle,
                },
                isWeb &&
                  hovered &&
                  !isActive && {
                    backgroundColor: colors.stateHover,
                  },
                pressed && { backgroundColor: colors.statePressed },
                isWeb && focused && getWebFocusStyle(colors.focus),
                isWeb &&
                  ({
                    transition: `background-color ${feedbackDuration}ms ease`,
                  } as any),
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
                    color: isActive ? colors.text : colors.textSecondary,
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
    cursor: Platform.OS === "web" ? "pointer" : undefined,
  } as any,
  chipText: {
    ...uiTypography.label,
    textAlign: "center",
  },
  chipTextActive: {},
});
