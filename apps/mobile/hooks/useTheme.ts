import { useColorScheme } from "react-native";
import { useAuthStore } from "../stores/authStore";
import { PALETTE, type ThemeColors } from "../constants/theme";

export { type ThemeColors };

export function useTheme() {
  const systemColorScheme = useColorScheme();
  const themePreference = useAuthStore((s) => s.theme);

  const isDark =
    themePreference === "system"
      ? systemColorScheme === "dark"
      : themePreference === "dark";

  const colors = isDark ? PALETTE.dark : PALETTE.light;

  return {
    isDark,
    colors,
    themePreference,
  };
}
