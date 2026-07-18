import React, { useCallback, useRef } from "react";
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
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import { hapticSelection } from "../../lib/haptics";
import { getWebFocusStyle, uiTouchTarget, uiTypography } from "./designSystem";

export type ContentTabOption<T extends string = string> = {
  label: string;
  value: T;
};

export function getContentTabNavigationIndex(
  currentIndex: number,
  optionCount: number,
  key: string,
) {
  if (optionCount <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return optionCount - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % optionCount;
  if (key === "ArrowLeft") {
    return (currentIndex - 1 + optionCount) % optionCount;
  }
  return null;
}

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
  const { colors } = useTheme();
  const tabRefs = useRef<any[]>([]);
  const handleChange = useCallback(
    (nextValue: T) => {
      hapticSelection();
      onChange(nextValue);
    },
    [onChange],
  );
  const handleTabKeyDown = useCallback(
    (event: any, currentIndex: number) => {
      const key = event.nativeEvent?.key ?? event.key;
      const nextIndex = getContentTabNavigationIndex(
        currentIndex,
        options.length,
        key,
      );
      if (nextIndex === null) return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      const nextOption = options[nextIndex];
      if (!nextOption) return true;
      handleChange(nextOption.value);
      tabRefs.current[nextIndex]?.focus?.();
      return true;
    },
    [handleChange, options],
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
      {options.map((option, index) => (
        <ContentTab
          key={option.value}
          option={option}
          selected={option.value === value}
          variant={variant}
          onChange={handleChange}
          onKeyDown={(event) => handleTabKeyDown(event, index)}
          registerRef={(node) => {
            tabRefs.current[index] = node;
          }}
        />
      ))}
    </ScrollView>
  );
}

function ContentTab<T extends string>({
  option,
  selected,
  variant,
  onChange,
  onKeyDown,
  registerRef,
}: {
  option: ContentTabOption<T>;
  selected: boolean;
  variant: "underline" | "segmented";
  onChange: (value: T) => void;
  onKeyDown: (event: any) => boolean;
  registerRef: (node: any) => void;
}) {
  const { colors, isDark } = useTheme();
  const activate = useCallback(
    () => onChange(option.value),
    [onChange, option],
  );
  const { isKeyboardFocused, webPressableProps } =
    useWebPressableActivation(activate);
  const handleKeyDown = useCallback(
    (event: any) => {
      if (onKeyDown(event)) return;
      (webPressableProps as any).onKeyDown?.(event);
    },
    [onKeyDown, webPressableProps],
  );

  return (
    <Pressable
      {...webPressableProps}
      ref={registerRef}
      tabIndex={Platform.OS === "web" ? (selected ? 0 : -1) : undefined}
      {...(Platform.OS === "web" ? ({ onKeyDown: handleKeyDown } as any) : {})}
      accessibilityRole="tab"
      accessibilityLabel={option.label}
      accessibilityState={{ selected }}
      aria-selected={Platform.OS === "web" ? selected : undefined}
      onPress={activate}
      style={({ hovered, pressed }: any) => [
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
          isKeyboardFocused &&
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
