import { Platform, Pressable, StyleSheet, View } from "react-native";

type PlayerInteractionLayerProps = {
  onTapSide: (side: "left" | "right") => void;
  onToggleControls: () => void;
};

/**
 * Pointer/touch-only hit areas that sit behind the visible player controls.
 * They deliberately stay out of the keyboard and screen-reader order: every
 * playback action is already exposed by a labelled control or hotkey.
 */
export function PlayerInteractionLayer({
  onTapSide,
  onToggleControls,
}: PlayerInteractionLayerProps) {
  const passiveProps = {
    accessible: false,
    focusable: false,
    importantForAccessibility: "no" as const,
    tabIndex: -1 as const,
  };

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <Pressable
        {...passiveProps}
        testID="player-hit-zone-left"
        style={styles.side}
        onPress={() => onTapSide("left")}
      />
      <Pressable
        {...passiveProps}
        testID="player-hit-zone-center"
        style={styles.center}
        onPress={onToggleControls}
      />
      <Pressable
        {...passiveProps}
        testID="player-hit-zone-right"
        style={styles.side}
        onPress={() => onTapSide("right")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    flexDirection: "row",
  },
  side: {
    flex: 1,
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
  center: {
    width: "20%",
    ...Platform.select({ web: { outlineStyle: "none" } as any }),
  },
});
