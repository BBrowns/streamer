import type { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useWindowClass } from "../../hooks/useWindowClass";
import { getWindowGutter, uiLayout } from "./designSystem";

export type ContentBoundarySize =
  | "cinematic"
  | "catalog"
  | "utilityWide"
  | "utilityNarrow"
  | "content"
  | "detail"
  | "reading";

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
  if (size === "cinematic") return uiLayout.pageWidths.cinematic;
  if (size === "catalog") return uiLayout.pageWidths.catalog;
  if (size === "utilityWide") return uiLayout.pageWidths.utilityWide;
  if (size === "utilityNarrow") return uiLayout.pageWidths.utilityNarrow;
  if (size === "reading") return uiLayout.pageWidths.utilityNarrow;
  if (size === "detail") return uiLayout.detailMaxWidth;
  return uiLayout.pageWidths.catalog;
}

export function ContentBoundary({
  children,
  size = "content",
  maxWidth,
  padded = true,
  style,
}: ContentBoundaryProps) {
  const { windowClass } = useWindowClass();
  const horizontalPadding = getWindowGutter(windowClass);

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
