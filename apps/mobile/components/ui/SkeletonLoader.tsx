import { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, type ViewStyle } from "react-native";

interface SkeletonProps {
  variant?: "card" | "row" | "text" | "circle";
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Animated skeleton loader with shimmer effect.
 *
 * Uses a pulsing opacity animation via the native Animated API
 * (compatible with Reanimated but doesn't require it for this simple case).
 *
 * Variants:
 * - `card`: Full poster-sized card (2:3 aspect ratio)
 * - `row`: Horizontal bar (catalog row placeholder)
 * - `text`: Short text line
 * - `circle`: Avatar/icon placeholder
 */
export function SkeletonLoader({
  variant = "text",
  width,
  height,
  borderRadius,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const variantStyle = getVariantStyle(variant);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading content"
      style={[
        styles.base,
        variantStyle,
        { opacity },
        width !== undefined && { width: width as any },
        height !== undefined && { height: height as any },
        borderRadius !== undefined && { borderRadius },
        style,
      ]}
    />
  );
}

function getVariantStyle(variant: SkeletonProps["variant"]) {
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
    backgroundColor: "#1e293b", // Slate grey for better visibility on black
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
