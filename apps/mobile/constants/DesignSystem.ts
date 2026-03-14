export const Colors = {
  primary: "#00f2ff", // Cyber Cyan
  secondary: "#818cf8", // Indigo
  background: "#010101", // AMOLED Black
  surface: "#080808", // Dark Surface
  surfaceBright: "#121212",
  text: "#ffffff",
  textMuted: "#888888",
  error: "#ff3b3b",
  success: "#00ff88",
  warning: "#ffd600",
  black: "#000000",
  white: "#ffffff",
  border: "rgba(255,255,255,0.08)",
  glass: "rgba(255,255,255,0.03)",
  glassStrong: "rgba(255,255,255,0.08)",
};

export const Shadows = {
  primary: {
    boxShadow: [
      {
        color: "rgba(0, 242, 255, 0.4)",
        offsetX: 0,
        offsetY: 8,
        blurRadius: 20,
      },
    ],
    elevation: 12,
  },
  secondary: {
    boxShadow: [
      {
        color: "rgba(129, 140, 248, 0.4)",
        offsetX: 0,
        offsetY: 8,
        blurRadius: 20,
      },
    ],
    elevation: 12,
  },
  glass: {
    boxShadow: [
      {
        color: "rgba(0, 0, 0, 0.2)",
        offsetX: 0,
        offsetY: 4,
        blurRadius: 8,
      },
    ],
    elevation: 4,
  },
};

export const Typography = {
  h1: {
    fontSize: 32,
    fontWeight: "900" as const,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: "800" as const,
    letterSpacing: -0.5,
  },
  h3: {
    fontSize: 20,
    fontWeight: "700" as const,
    letterSpacing: 0,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    fontWeight: "500" as const,
    letterSpacing: 0.5,
  },
};

export const Theme = {
  colors: Colors,
  shadows: Shadows,
  typography: Typography,
  radius: {
    m: 8,
    l: 12,
    xl: 16,
    xxl: 20,
    xxxl: 24,
    full: 9999,
  },
};
