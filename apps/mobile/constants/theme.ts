export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  header: string;
  border: string;
  tint: string;
  tabBar: string;
  error: string;
  success: string;
  warning: string;
};

export const PALETTE: { dark: ThemeColors; light: ThemeColors } = {
  dark: {
    background: "#010101",
    card: "#111118",
    text: "#ffffff",
    textSecondary: "#94a3b8",
    header: "#010101",
    border: "rgba(255,255,255,0.1)",
    tint: "#00f2ff", // Neon Cyan for Dark
    tabBar: "#080808",
    error: "#f87171",
    success: "#4ade80",
    warning: "#fbbf24",
  },
  light: {
    background: "#ffffff",
    card: "#f8fafc",
    text: "#0f172a",
    textSecondary: "#475569",
    header: "#ffffff",
    border: "rgba(0,0,0,0.08)",
    tint: "#6366f1", // Indigo for Light
    tabBar: "#ffffff",
    error: "#ef4444",
    success: "#22c55e",
    warning: "#f59e0b",
  },
};
