import { Platform } from "react-native";
import type { ThemeColors } from "../../constants/theme";

export const uiSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
  section: 64,
};

export const uiRadii = {
  xs: 8,
  sm: 12,
  md: 12,
  lg: 16,
  xl: 20,
  control: 8,
  card: 12,
  sheet: 20,
  hero: 20,
  pill: 999,
};

export const uiTouchTarget = 44;

export const uiMotion = {
  fast: 120,
  standard: 180,
  slow: 280,
};

export const uiLayout = {
  contentMaxWidth: 1600,
  readingMaxWidth: 760,
  detailMaxWidth: 1120,
  compactGutter: 16,
  mediumGutter: 24,
  desktopGutter: 40,
  settingsRailWidth: 256,
  filterRailWidth: 240,
} as const;

const webInterFontStack =
  '"Inter Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const uiFonts = {
  regular: Platform.OS === "web" ? webInterFontStack : "Inter_400Regular",
  medium: Platform.OS === "web" ? webInterFontStack : "Inter_500Medium",
  semibold: Platform.OS === "web" ? webInterFontStack : "Inter_600SemiBold",
  bold: Platform.OS === "web" ? webInterFontStack : "Inter_700Bold",
  extrabold: Platform.OS === "web" ? webInterFontStack : "Inter_800ExtraBold",
  black: Platform.OS === "web" ? webInterFontStack : "Inter_900Black",
  system: Platform.select({
    ios: "System",
    android: "sans-serif",
    web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    default: "System",
  }),
} as const;

export function getWebFocusStyle(color: string) {
  return {
    outlineStyle: "solid",
    outlineWidth: 3,
    outlineColor: color,
    outlineOffset: 2,
  } as const;
}

/**
 * React Native accessibilityState serves native assistive technology, but the
 * web renderer needs an explicit ARIA state for custom Pressable controls.
 * Keep this as a small shared bridge so switches, checkboxes, and radios stay
 * semantically equivalent across platforms.
 */
export function getWebAriaChecked(checked: boolean) {
  return Platform.OS === "web" ? { "aria-checked": checked } : {};
}

export function getAccentForeground(colors: ThemeColors) {
  return colors.onTint;
}

export function getPrimaryForeground(colors: ThemeColors) {
  return colors.onPrimary;
}

export const uiTypography = {
  display: {
    fontFamily: uiFonts.extrabold,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: "800" as const,
    letterSpacing: -1.4,
  },
  headline: {
    fontFamily: uiFonts.extrabold,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800" as const,
    letterSpacing: -0.8,
  },
  sectionLabel: {
    fontFamily: uiFonts.bold,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700" as const,
    letterSpacing: 0.4,
  },
  control: {
    fontFamily: uiFonts.bold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700" as const,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: uiFonts.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500" as const,
    letterSpacing: 0,
  },
  body: {
    fontFamily: uiFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400" as const,
    letterSpacing: 0,
  },
  title: {
    fontFamily: uiFonts.bold,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700" as const,
    letterSpacing: -0.35,
  },
  label: {
    fontFamily: uiFonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600" as const,
    letterSpacing: 0,
  },
};

export type SurfaceTone = "default" | "accent" | "warning" | "danger" | "plain";
export type StatusTone = "success" | "warning" | "error" | "neutral" | "info";

export function getSurfaceColors(
  colors: ThemeColors,
  isDark: boolean,
  tone: SurfaceTone = "default",
) {
  if (tone === "plain") {
    return { backgroundColor: "transparent", borderColor: "transparent" };
  }

  if (tone === "accent") {
    return {
      backgroundColor: colors.tint + (isDark ? "14" : "10"),
      borderColor: "transparent",
    };
  }

  if (tone === "warning") {
    return {
      backgroundColor: colors.warning + (isDark ? "16" : "12"),
      borderColor: colors.warning + "42",
    };
  }

  if (tone === "danger") {
    return {
      backgroundColor: colors.error + (isDark ? "16" : "12"),
      borderColor: colors.error + "42",
    };
  }

  return {
    backgroundColor: colors.card,
    borderColor: "transparent",
  };
}

export function getToneColor(colors: ThemeColors, tone: StatusTone) {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "error") return colors.error;
  if (tone === "info") return colors.tint;
  return colors.textSecondary;
}

export function getSoftOverlayColor(isDark: boolean) {
  return isDark ? "rgba(8,9,12,0.72)" : "rgba(243,242,239,0.82)";
}
