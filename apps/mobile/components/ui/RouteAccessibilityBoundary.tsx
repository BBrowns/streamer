import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
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
  const rootRef = useRef<View>(null);
  const [webHidden, setWebHidden] = useState(() => !isFocused);

  // Do not flip aria-hidden on a route while focus is still inside it. That
  // transition is rejected by Chromium and leaves assistive technology with
  // a focused element in a hidden subtree. `inert` blocks the next focus
  // interaction immediately; the layout effect clears an existing focus
  // before exposing aria-hidden on the retained route.
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    if (isFocused) {
      setWebHidden(false);
      return;
    }

    if (typeof document === "undefined") {
      setWebHidden(true);
      return;
    }

    const root = rootRef.current as unknown as HTMLElement | null;
    const activeElement = document.activeElement;
    if (
      root &&
      activeElement &&
      typeof root.contains === "function" &&
      root.contains(activeElement) &&
      typeof (activeElement as HTMLElement).blur === "function"
    ) {
      (activeElement as HTMLElement).blur();
    }
    setWebHidden(true);
  }, [isFocused]);

  return (
    <View
      ref={rootRef}
      testID="route-accessibility-boundary"
      accessible={false}
      accessibilityElementsHidden={!isFocused}
      importantForAccessibility={isFocused ? "auto" : "no-hide-descendants"}
      {...(Platform.OS === "web"
        ? ({
            "aria-hidden": webHidden ? true : undefined,
            inert: !isFocused,
          } as any)
        : {})}
      style={styles.root}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
