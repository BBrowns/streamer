import React, { useEffect } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  cancelAnimation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useReducedMotion } from "../../hooks/useReducedMotion";

interface SkeletonProps {
  variant?: "card" | "row" | "text" | "circle";
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

/**
 * Premium Skeleton Loader with Reanimated-based shimmer effect.
 */
export function SkeletonLoader({
  variant = "text",
  width,
  height,
  borderRadius,
  style,
}: SkeletonProps) {
  const { isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const shimmerValue = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(shimmerValue);
      shimmerValue.value = 0;
      return;
    }
    shimmerValue.value = withRepeat(
      withTiming(1, { duration: 1500 }),
      -1,
      false,
    );
    return () => cancelAnimation(shimmerValue);
  }, [reducedMotion, shimmerValue]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shimmerValue.value, [0, 1], [-150, 150]);
    return {
      transform: [{ translateX }],
    };
  });

  const variantStyle = getVariantStyle(variant);
  const bgColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
  const shimmerColors = isDark
    ? (["transparent", "rgba(255,255,255,0.08)", "transparent"] as const)
    : (["transparent", "rgba(255,255,255,0.3)", "transparent"] as const);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading content"
      style={[
        styles.base,
        variantStyle,
        {
          width: width as any,
          height: height as any,
          borderRadius: borderRadius ?? (variantStyle?.borderRadius as number),
          backgroundColor: bgColor,
        },
        style,
      ]}
    >
      {!reducedMotion ? (
        <AnimatedLinearGradient
          colors={shimmerColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[StyleSheet.absoluteFill, animatedStyle]}
        />
      ) : null}
    </View>
  );
}

function getVariantStyle(variant: SkeletonProps["variant"]): ViewStyle {
  switch (variant) {
    case "card":
      return styles.card;
    case "row":
      return styles.row;
    case "circle":
      return styles.circle;
    case "text":
    default:
      return styles.text;
  }
}

/** Renders a grid of skeleton cards (e.g. for catalog loading) */
export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <View
      style={styles.grid}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading catalog"
    >
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.gridItem}>
          <SkeletonLoader variant="card" />
          <SkeletonLoader variant="text" style={{ marginTop: 8 }} />
          <SkeletonLoader variant="text" width="60%" style={{ marginTop: 4 }} />
        </View>
      ))}
    </View>
  );
}

/** Renders a horizontal row of skeleton items (e.g. for CatalogRow loading) */
export function SkeletonRow() {
  return (
    <View style={styles.rowContainer}>
      <SkeletonLoader
        variant="text"
        width="40%"
        height={18}
        style={{ marginBottom: 12 }}
      />
      <View style={styles.horizontalRow}>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonLoader
            key={i}
            variant="card"
            width={120}
            height={180}
            borderRadius={12}
            style={{ marginRight: 12 }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
  card: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 16,
  },
  row: {
    width: "100%",
    height: 48,
    borderRadius: 10,
  },
  text: {
    width: "100%",
    height: 14,
    borderRadius: 6,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 12,
  },
  gridItem: {
    width: "47%",
    marginBottom: 8,
  },
  rowContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  horizontalRow: {
    flexDirection: "row",
  },
});
