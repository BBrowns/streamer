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
    background: "#11121c",
    card: "rgba(255,255,255,0.08)",
    text: "#fff8ff",
    textSecondary: "#c6bfd2",
    header: "#151622",
    border: "rgba(255,255,255,0.14)",
    tint: "#d8b4fe",
    tabBar: "rgba(18,19,31,0.92)",
    error: "#ff9ba6",
    success: "#a7e8bd",
    warning: "#ffd9a8",
  },
  light: {
    background: "#fbf6f4",
    card: "rgba(255,255,255,0.72)",
    text: "#282236",
    textSecondary: "#6f657d",
    header: "#fff8f5",
    border: "rgba(106, 93, 125, 0.16)",
    tint: "#a78bfa",
    tabBar: "rgba(255, 250, 248, 0.94)",
    error: "#df6b7a",
    success: "#63b987",
    warning: "#d7a15f",
  },
};
