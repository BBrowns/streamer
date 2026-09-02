import type { ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ThemeColors } from "../../constants/theme";
import { useReducedTransparency } from "../../hooks/useReducedTransparency";
import { useTheme } from "../../hooks/useTheme";
import { uiRadii } from "./designSystem";

export type FloatingSurfaceLevel = "menu" | "sheet" | "media";

type FloatingSurfaceMaterialOptions = {
  level: FloatingSurfaceLevel;
  colors: ThemeColors;
  reducedTransparency: boolean;
  platform?: string;
};

export function resolveFloatingSurfaceMaterial({
  level,
  colors,
  reducedTransparency,
  platform = "web",
}: FloatingSurfaceMaterialOptions) {
  const nativeAndroid = platform === "android";
  const canUseWebMaterial = platform === "web" && !reducedTransparency;
  const opaqueFallback =
    reducedTransparency ||
    nativeAndroid ||
    (level === "sheet" && !canUseWebMaterial);
  const backgroundColor = opaqueFallback
    ? colors.opaqueGlassFallback
    : level === "sheet"
      ? colors.surfaceOverlay
      : colors.surfaceFloating;
  const shadowOpacity =
    level === "menu" ? 0.2 : level === "media" ? 0.24 : 0.28;
  const shadowRadius = level === "menu" ? 18 : level === "media" ? 24 : 32;
  const shadowStyle =
    platform === "web"
      ? { boxShadow: `0 12px ${shadowRadius}px rgba(0,0,0,${shadowOpacity})` }
      : {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity,
          shadowRadius,
        };

  return {
    backgroundColor,
    borderColor: colors.borderStrong,
    borderRadius:
      level === "sheet"
        ? uiRadii.sheet
        : level === "media"
          ? uiRadii.lg
          : uiRadii.lg,
    elevation: level === "menu" ? 10 : level === "media" ? 12 : 16,
    ...shadowStyle,
    ...(canUseWebMaterial && level !== "sheet"
      ? {
          backdropFilter: level === "media" ? "blur(10px)" : "blur(12px)",
        }
      : {}),
  };
}

export function FloatingSurface({
  children,
  style,
  testID,
  level = "menu",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  level?: FloatingSurfaceLevel;
}) {
  const { colors } = useTheme();
  const reducedTransparency = useReducedTransparency();
  const material = resolveFloatingSurfaceMaterial({
    level,
    colors,
    reducedTransparency,
    platform: Platform.OS,
  });
  const { backdropFilter, ...materialStyle } = material;

  return (
    <View
      testID={testID}
      style={[
        styles.surface,
        materialStyle,
        backdropFilter
          ? ({
              backdropFilter,
              WebkitBackdropFilter: backdropFilter,
            } as any)
          : null,
        style,
        // A caller may customize a normal surface, but accessibility and
        // platform fallbacks always win over a translucent override.
        (reducedTransparency || Platform.OS === "android") && {
          backgroundColor: material.backgroundColor,
          borderColor: material.borderColor,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderWidth: 1,
    overflow: "hidden",
  },
});
