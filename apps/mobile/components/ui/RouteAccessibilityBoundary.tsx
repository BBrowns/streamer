import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";

/**
 * Tab navigators retain route views for fast switching. Retained views must
 * not remain in the web accessibility tree while another tab is active.
 * The fallback focus state keeps isolated component tests usable without a
 * Router provider.
 */
export function RouteAccessibilityBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const isFocused = useIsFocused();

  return (
    <View
      accessible={false}
      accessibilityElementsHidden={!isFocused}
      importantForAccessibility={isFocused ? "auto" : "no-hide-descendants"}
      {...(Platform.OS === "web"
        ? ({ "aria-hidden": isFocused ? undefined : true } as any)
        : {})}
      style={styles.root}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
