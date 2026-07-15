import type { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useWindowClass } from "../../hooks/useWindowClass";
import { uiLayout } from "./designSystem";

type ContentBoundaryProps = {
  children: ReactNode;
  maxWidth?: number;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ContentBoundary({
  children,
  maxWidth = uiLayout.contentMaxWidth,
  padded = true,
  style,
}: ContentBoundaryProps) {
  const { windowClass } = useWindowClass();
  const horizontalPadding =
    windowClass === "compact"
      ? uiLayout.compactGutter
      : windowClass === "medium"
        ? uiLayout.mediumGutter
        : uiLayout.desktopGutter;

  return (
    <View
      style={[
        styles.boundary,
        { maxWidth },
        padded && { paddingHorizontal: horizontalPadding },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  boundary: {
    width: "100%",
    alignSelf: "center",
  },
});
