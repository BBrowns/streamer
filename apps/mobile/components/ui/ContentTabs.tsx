import React, { useCallback } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { hapticSelection } from "../../lib/haptics";
import { getWebFocusStyle, uiTouchTarget, uiTypography } from "./designSystem";

export type ContentTabOption<T extends string = string> = {
  label: string;
  value: T;
};

type ContentTabsProps<T extends string> = {
  options: readonly ContentTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  variant?: "underline" | "segmented";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Quiet navigation between peer content views, such as All, Movies, and Series.
 * Faceted and status filters should continue to use FilterChipBar.
 */
export function ContentTabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  variant = "underline",
  style,
  testID,
}: ContentTabsProps<T>) {
  const { colors, isDark } = useTheme();
  const handleChange = useCallback(
    (nextValue: T) => {
      hapticSelection();
      onChange(nextValue);
    },
    [onChange],
  );

  return (
    <ScrollView
      horizontal
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      showsHorizontalScrollIndicator={false}
      style={[
        style,
        variant === "segmented" && [
          styles.segmentedFrame,
          { backgroundColor: colors.card, borderColor: colors.border },
        ],
      ]}
      contentContainerStyle={[
        styles.content,
        variant === "segmented" && styles.segmentedContent,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            aria-selected={Platform.OS === "web" ? selected : undefined}
            onPress={() => handleChange(option.value)}
            style={({ hovered, pressed, focused }: any) => [
              styles.tab,
              variant === "segmented" && styles.segmentedTab,
              variant === "segmented" &&
                selected && {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.tint + (isDark ? "66" : "42"),
                },
              Platform.OS === "web" &&
                hovered &&
                !selected && {
                  backgroundColor: isDark
                    ? "rgba(244,245,247,0.04)"
                    : "rgba(16,18,22,0.04)",
                },
              pressed && styles.pressed,
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.text : colors.textSecondary },
                selected && styles.labelSelected,
              ]}
            >
              {option.label}
            </Text>
            {selected && variant === "underline" && (
              <View
                testID={`content-tab-indicator-${option.value}`}
                style={[styles.indicator, { backgroundColor: colors.tint }]}
              />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "stretch",
    gap: 20,
  },
  segmentedFrame: {
    flexGrow: 0,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 12,
  },
  segmentedContent: {
    gap: 2,
    padding: 3,
  },
  tab: {
    minWidth: uiTouchTarget,
    minHeight: uiTouchTarget,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    position: "relative",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : null),
  } as any,
  segmentedTab: {
    width: 90,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 8,
  },
  label: {
    ...uiTypography.label,
    fontSize: 14,
  },
  labelSelected: {
    fontWeight: "700",
  },
  indicator: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
  pressed: {
    opacity: 0.68,
  },
});
