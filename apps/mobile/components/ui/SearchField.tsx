import React, { forwardRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useWebPressableActivation } from "../../hooks/useWebPressableActivation";
import { getWebFocusStyle, uiTouchTarget } from "./designSystem";

type SearchFieldProps = Omit<TextInputProps, "style"> & {
  value: string;
  onClear: () => void;
  clearAccessibilityLabel: string;
  loading?: boolean;
  shortcutHint?: string;
  variant?: "underline" | "surface";
  inset?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

/** Shared search-input behavior for editorial and compact surface contexts. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(
  function SearchField(
    {
      value,
      onClear,
      clearAccessibilityLabel,
      loading = false,
      shortcutHint,
      variant = "underline",
      inset = false,
      containerStyle,
      inputStyle,
      placeholderTextColor,
      testID,
      onFocus,
      onBlur,
      ...inputProps
    },
    ref,
  ) {
    const { colors } = useTheme();
    const [focused, setFocused] = useState(false);
    const { isKeyboardFocused: isClearFocused, webPressableProps: clearProps } =
      useWebPressableActivation(onClear);

    return (
      <View
        testID={testID ? `${testID}-container` : undefined}
        style={[
          styles.container,
          inset && styles.inset,
          variant === "surface"
            ? [
                styles.surface,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderColor: focused ? colors.focus : "transparent",
                },
              ]
            : {
                borderBottomColor: focused ? colors.focus : colors.border,
                borderBottomWidth: focused ? 2 : 1,
              },
          containerStyle,
        ]}
      >
        <Ionicons
          name="search"
          size={19}
          color={focused ? colors.text : colors.textSecondary}
        />
        <TextInput
          {...inputProps}
          ref={ref}
          testID={testID}
          value={value}
          autoCapitalize={inputProps.autoCapitalize ?? "none"}
          autoCorrect={inputProps.autoCorrect ?? false}
          returnKeyType={inputProps.returnKeyType ?? "search"}
          placeholderTextColor={
            placeholderTextColor ?? `${colors.textSecondary}B8`
          }
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, { color: colors.text }, inputStyle]}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.tint} />
        ) : null}
        {!loading && shortcutHint && value.length === 0 ? (
          <Text
            style={[
              styles.shortcut,
              {
                color: colors.textSecondary,
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            {shortcutHint}
          </Text>
        ) : null}
        {value.length > 0 ? (
          <Pressable
            {...clearProps}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={clearAccessibilityLabel}
            style={({ pressed }: any) => [
              styles.clearButton,
              pressed && styles.pressed,
              Platform.OS === "web" &&
                isClearFocused &&
                getWebFocusStyle(colors.focus),
            ]}
          >
            <Ionicons name="close" size={19} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  inset: {
    minHeight: 62,
    paddingHorizontal: 18,
  },
  surface: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  shortcut: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  clearButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.68,
  },
});
