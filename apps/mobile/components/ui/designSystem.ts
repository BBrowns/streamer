import type { ThemeColors } from "../../constants/theme";

export const uiSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const uiRadii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
};

export const uiTouchTarget = 44;

export const uiMotion = {
  fast: 160,
  standard: 240,
  slow: 360,
};

export function getWebFocusStyle(color: string) {
  return {
    outlineStyle: "solid",
    outlineWidth: 3,
    outlineColor: color,
    outlineOffset: 2,
  } as const;
}

export function getAccentForeground(colors: ThemeColors) {
  return colors.onTint;
}

export const uiTypography = {
  sectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800" as const,
    letterSpacing: 0,
  },
  control: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800" as const,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700" as const,
    letterSpacing: 0,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600" as const,
    letterSpacing: 0,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900" as const,
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
      backgroundColor: isDark
        ? "rgba(216,180,254,0.12)"
        : "rgba(167,139,250,0.10)",
      borderColor: colors.tint + "36",
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
    backgroundColor: isDark ? "rgba(255,255,255,0.055)" : colors.card,
    borderColor: colors.border,
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
  return isDark ? "rgba(9,10,18,0.68)" : "rgba(251,246,244,0.78)";
}
