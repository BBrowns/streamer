import React, { useState } from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { getWebFocusStyle, uiRadii, uiTypography } from "./designSystem";

type TextFieldProps = TextInputProps & {
  label: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  containerStyle,
  style,
  placeholderTextColor,
  accessibilityLabel,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={accessibilityLabel ?? label}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceElevated,
            color: colors.text,
            borderColor: focused ? colors.tint : "transparent",
          },
          Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          style,
        ]}
        placeholderTextColor={
          placeholderTextColor ?? `${colors.textSecondary}80`
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    ...uiTypography.label,
  },
  input: {
    minHeight: 48,
    borderRadius: uiRadii.control,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    borderWidth: 1,
    ...uiTypography.body,
  },
});
