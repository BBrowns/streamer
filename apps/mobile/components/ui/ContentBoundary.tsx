import type { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useWindowClass } from "../../hooks/useWindowClass";
import { uiLayout } from "./designSystem";

export type ContentBoundarySize = "content" | "detail" | "reading";

type ContentBoundaryProps = {
  children: ReactNode;
  size?: ContentBoundarySize;
  maxWidth?: number;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function getContentBoundaryMaxWidth(
  size: ContentBoundarySize = "content",
) {
  if (size === "reading") return uiLayout.readingMaxWidth;
  if (size === "detail") return uiLayout.detailMaxWidth;
  return uiLayout.contentMaxWidth;
}

export function ContentBoundary({
  children,
  size = "content",
  maxWidth,
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
        { maxWidth: maxWidth ?? getContentBoundaryMaxWidth(size) },
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
