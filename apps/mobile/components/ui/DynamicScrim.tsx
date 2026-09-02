import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useCinematicTheme } from "../../contexts/CinematicThemeContext";
import { useTheme } from "../../hooks/useTheme";
import type { ThemeColors } from "../../constants/theme";
import type { CinematicTheme } from "../../services/cinematicTheme";
import {
  getNativePointerEvents,
  getPointerEventsStyle,
} from "../../lib/platformStyles";

export function getDynamicScrimBottomColors(
  theme: Pick<CinematicTheme, "scrimTransparent">,
  colors: Pick<ThemeColors, "scrimSoft" | "background">,
) {
  return [
    theme.scrimTransparent,
    theme.scrimTransparent,
    colors.scrimSoft,
    colors.background,
  ] as const;
}

export function DynamicScrim() {
  const { theme } = useCinematicTheme();
  const { colors } = useTheme();
  return (
    <View
      pointerEvents={getNativePointerEvents("none")}
      style={[styles.fill, getPointerEventsStyle("none")]}
    >
      <LinearGradient
        colors={["rgba(8,9,11,0.56)", "rgba(8,9,11,0.18)", "rgba(8,9,11,0)"]}
        locations={[0, 0.16, 0.34]}
        style={styles.fill}
      />
      <LinearGradient
        colors={[theme.scrimDark, "rgba(8,9,11,0.52)", theme.scrimTransparent]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.fill}
      />
      <LinearGradient
        colors={getDynamicScrimBottomColors(theme, colors)}
        locations={[0, 0.78, 0.92, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.fill}
      />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFill } });
