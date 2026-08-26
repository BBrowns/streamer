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
  xxs: 6,
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

export const uiTouchTarget = Platform.OS === "android" ? 48 : 44;

export const uiMotion = {
  fast: 90,
  standard: 140,
  slow: 240,
  feedback: 90,
  content: 140,
  spatial: 200,
  overlay: 240,
  emphasis: 360,
  loadingLoop: 1500,
} as const;

export type UiMotionIntent =
  "feedback" | "content" | "spatial" | "overlay" | "emphasis" | "loadingLoop";

export function resolveMotionDuration(
  intent: UiMotionIntent,
  reducedMotion: boolean,
) {
  return reducedMotion ? 0 : uiMotion[intent];
}

export const uiLayout = {
  contentMaxWidth: 1560,
  readingMaxWidth: 760,
  detailMaxWidth: 1200,
  settingsMaxWidth: 1120,
  // Two-column settings are only comfortable when each column can absorb
  // the longest localized labels and their trailing controls.
  settingsColumnMinWidth: 360,
  settingsColumnGap: 32,
  compactGutter: 20,
  mediumGutter: 24,
  expandedGutter: 40,
  largeGutter: 56,
  desktopGutter: 40,
  filterRailWidth: 240,
  pageWidths: {
    cinematic: 1560,
    catalog: 1560,
    utilityWide: 1120,
    utilityNarrow: 760,
  },
} as const;

export function getWindowGutter(
  windowClass: "compact" | "medium" | "expanded" | "large",
) {
  if (windowClass === "compact") return uiLayout.compactGutter;
  if (windowClass === "medium") return uiLayout.mediumGutter;
  if (windowClass === "expanded") return uiLayout.expandedGutter;
  return uiLayout.largeGutter;
}

export function getPosterCardWidth(
  windowClass: "compact" | "medium" | "expanded" | "large",
) {
  if (windowClass === "compact") return 132;
  if (windowClass === "medium") return 152;
  if (windowClass === "expanded") return 168;
  return 198;
}

export function getHomeHeroOverlap(
  windowClass: "compact" | "medium" | "expanded" | "large",
) {
  if (windowClass === "compact") return 36;
  if (windowClass === "medium") return 48;
  if (windowClass === "expanded") return 64;
  return 88;
}

const systemFont = Platform.select({
  ios: "System",
  android: "sans-serif",
  web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  default: "System",
}) as string;

export const uiFonts = {
  regular: systemFont,
  medium: systemFont,
  semibold: systemFont,
  bold: systemFont,
  extrabold: systemFont,
  black: systemFont,
  system: systemFont,
  cinematic: "InstrumentSerif_400Regular",
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
 * Media artwork gets a tighter ring than controls so pointer lift and keyboard
 * focus remain visually distinct without adding permanent card chrome.
 */
export function getWebMediaFocusStyle(color: string) {
  return {
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineColor: color,
    outlineOffset: 3,
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
  cinematicDisplay: {
    fontFamily: uiFonts.cinematic,
    fontSize: 56,
    lineHeight: 58,
    fontWeight: "400" as const,
    letterSpacing: -1.2,
  },
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
    fontSize: Platform.OS === "ios" ? 17 : Platform.OS === "android" ? 16 : 15,
    lineHeight: Platform.OS === "web" ? 22 : 24,
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
  return isDark ? "rgba(8,9,11,0.72)" : "rgba(243,242,239,0.82)";
}
