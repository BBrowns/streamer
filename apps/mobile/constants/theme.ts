export type ThemeColors = {
  background: string;
  card: string;
  surfaceElevated: string;
  surfaceOverlay: string;
  text: string;
  textSecondary: string;
  header: string;
  border: string;
  tint: string;
  onTint: string;
  focus: string;
  scrim: string;
  disabled: string;
  opaqueGlassFallback: string;
  tabBar: string;
  error: string;
  success: string;
  warning: string;
};

export const PALETTE: { dark: ThemeColors; light: ThemeColors } = {
  dark: {
    background: "#080a0f",
    card: "#11141b",
    surfaceElevated: "#191d27",
    surfaceOverlay: "rgba(17,20,27,0.94)",
    text: "#f7f8fa",
    textSecondary: "#a7afbd",
    header: "#0d1016",
    border: "rgba(255,255,255,0.10)",
    tint: "#8b5cf6",
    onTint: "#ffffff",
    focus: "#c4b5fd",
    scrim: "rgba(0,0,0,0.72)",
    disabled: "#5d6470",
    opaqueGlassFallback: "#151923",
    tabBar: "rgba(8,10,15,0.96)",
    error: "#fb7185",
    success: "#4ade80",
    warning: "#fbbf24",
  },
  light: {
    background: "#f6f7f9",
    card: "#ffffff",
    surfaceElevated: "#eceff3",
    surfaceOverlay: "rgba(255,255,255,0.96)",
    text: "#151821",
    textSecondary: "#606978",
    header: "#ffffff",
    border: "rgba(21,24,33,0.12)",
    tint: "#7157d9",
    onTint: "#ffffff",
    focus: "#6d4aff",
    scrim: "rgba(21,24,33,0.42)",
    disabled: "#9aa1ad",
    opaqueGlassFallback: "#ffffff",
    tabBar: "rgba(255,255,255,0.96)",
    error: "#c43d59",
    success: "#238653",
    warning: "#a86508",
  },
};
