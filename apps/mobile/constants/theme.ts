export type ThemeColors = {
  background: string;
  card: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  surfaceOverlay: string;
  text: string;
  textSecondary: string;
  header: string;
  border: string;
  tint: string;
  onTint: string;
  primary: string;
  onPrimary: string;
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
    background: "#08090C",
    card: "#111318",
    surfaceElevated: "#181B21",
    surfaceSubtle: "#0D0F13",
    surfaceOverlay: "rgba(17,19,24,0.96)",
    text: "#F4F5F7",
    textSecondary: "#9DA3AE",
    header: "#08090C",
    border: "rgba(244,245,247,0.09)",
    tint: "#6C79F5",
    onTint: "#08090C",
    primary: "#F4F5F7",
    onPrimary: "#08090C",
    focus: "#8792FF",
    scrim: "rgba(0,0,0,0.76)",
    disabled: "#5E646E",
    opaqueGlassFallback: "#111318",
    tabBar: "rgba(8,9,12,0.97)",
    error: "#FF7087",
    success: "#4EC98B",
    warning: "#E7B86A",
  },
  light: {
    background: "#F3F2EF",
    card: "#FFFFFF",
    surfaceElevated: "#E9E8E4",
    surfaceSubtle: "#F8F7F4",
    surfaceOverlay: "rgba(255,255,255,0.97)",
    text: "#101216",
    textSecondary: "#656B75",
    header: "#F3F2EF",
    border: "rgba(16,18,22,0.09)",
    tint: "#4F5FD1",
    onTint: "#FFFFFF",
    primary: "#101216",
    onPrimary: "#FFFFFF",
    focus: "#4F5FD1",
    scrim: "rgba(16,18,22,0.48)",
    disabled: "#9A9EA5",
    opaqueGlassFallback: "#FFFFFF",
    tabBar: "rgba(243,242,239,0.97)",
    error: "#B8324D",
    success: "#1F7A50",
    warning: "#8B5A13",
  },
};
