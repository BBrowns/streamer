import React from "react";
import { Text, TextProps, StyleSheet, TextStyle } from "react-native";
import { Theme } from "../../constants/DesignSystem";

interface TypographyProps extends TextProps {
  variant?: "h1" | "h2" | "h3" | "body" | "caption";
  color?: string;
  align?: "auto" | "left" | "right" | "center" | "justify";
  weight?: "400" | "500" | "600" | "700" | "800" | "900";
  style?: TextStyle | TextStyle[];
}

/**
 * Reusable Typography component for the Streamer app.
 * Enforces consistent font sizes, weights, and letter-spacing based on the DesignSystem.
 */
export function Typography({
  variant = "body",
  color,
  align,
  weight,
  style,
  children,
  ...props
}: TypographyProps) {
  const variantStyle = Theme.typography[variant];

  const combinedStyle: TextStyle = {
    ...variantStyle,
    color: color || Theme.colors.text,
    textAlign: align,
    fontWeight: weight || variantStyle.fontWeight,
  };

  return (
    <Text style={[combinedStyle, style]} {...props}>
      {children}
    </Text>
  );
}
