import React from "react";
import {
  Pressable,
  View,
  Image,
  StyleSheet,
  ViewStyle,
  ImageSourcePropType,
} from "react-native";
import { Theme } from "../../constants/DesignSystem";
import { Typography } from "./Typography";
import { GlassPanel } from "./GlassPanel";

interface CardProps {
  title: string;
  subtitle?: string;
  image?: string | ImageSourcePropType;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  aspectRatio?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * Reusable Card component for the Streamer app.
 * Used for movie posters, add-on previews, and other grid/list items.
 */
export function Card({
  title,
  subtitle,
  image,
  onPress,
  style,
  aspectRatio = 2 / 3, // Default poster ratio
  accessibilityLabel,
  accessibilityHint,
}: CardProps) {
  const content = (
    <GlassPanel style={styles.card} bordered={true}>
      {image && (
        <View style={[styles.imageWrapper, { aspectRatio }]}>
          <Image
            source={typeof image === "string" ? { uri: image } : image}
            style={styles.image}
            resizeMode="cover"
          />
        </View>
      )}
      <View style={styles.content}>
        <Typography variant="h3" numberOfLines={1}>
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="caption"
            color={Theme.colors.textMuted}
            numberOfLines={1}
          >
            {subtitle}
          </Typography>
        )}
      </View>
    </GlassPanel>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
          style as any,
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel || `${title}${subtitle ? `, ${subtitle}` : ""}`
        }
        accessibilityHint={accessibilityHint}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.pressable, style as any]}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: "100%",
  },
  card: {
    width: "100%",
  },
  imageWrapper: {
    width: "100%",
    backgroundColor: Theme.colors.surface,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  content: {
    padding: 12,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
