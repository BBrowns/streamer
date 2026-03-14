import React, { useState } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Theme } from "../../constants/DesignSystem";
import { Ionicons } from "@expo/vector-icons";

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  containerStyle?: ViewStyle;
}

/**
 * Reusable TextField component for the Streamer app.
 * Provides a consistent, glass-themed input field with support for icons, labels, and error states.
 */
export function TextField({
  label,
  error,
  icon,
  containerStyle,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputFocused,
          !!error && styles.inputError,
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={isFocused ? Theme.colors.primary : Theme.colors.textMuted}
            style={styles.icon}
          />
        )}
        <TextInput
          style={styles.input}
          placeholderTextColor={Theme.colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    width: "100%",
  },
  label: {
    color: Theme.colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.colors.surfaceBright,
    borderRadius: Theme.radius.l,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  inputFocused: {
    borderColor: Theme.colors.primary,
    backgroundColor: "rgba(0, 242, 255, 0.05)",
  },
  inputError: {
    borderColor: Theme.colors.error,
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: Theme.colors.text,
    fontSize: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: Theme.colors.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
});
