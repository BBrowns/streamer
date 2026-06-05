import React from "react";
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

type TextFieldProps = TextInputProps & {
  label: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  containerStyle,
  style,
  placeholderTextColor,
  ...props
}: TextFieldProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
            color: colors.text,
            borderColor: colors.border,
          },
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
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    borderWidth: 1,
    fontSize: 15,
  },
});
