import { Platform, StyleSheet, type ViewStyle } from "react-native";

export type PointerEvents = "auto" | "none" | "box-none" | "box-only";

const pointerEventStyles = StyleSheet.create({
  auto: { pointerEvents: "auto" },
  none: { pointerEvents: "none" },
  boxNone: { pointerEvents: "box-none" },
  boxOnly: { pointerEvents: "box-only" },
});

const pointerEventStyleKeys: Record<
  PointerEvents,
  keyof typeof pointerEventStyles
> = {
  auto: "auto",
  none: "none",
  "box-none": "boxNone",
  "box-only": "boxOnly",
};

/**
 * React Native Web maps pointerEvents through CSS and warns about the legacy
 * prop. Keep the native prop for native targets, and use the web style on web.
 */
export function getPointerEventsStyle(
  value: PointerEvents,
): ViewStyle | undefined {
  return Platform.OS === "web"
    ? pointerEventStyles[pointerEventStyleKeys[value]]
    : undefined;
}

export function getNativePointerEvents(
  value: PointerEvents,
): PointerEvents | undefined {
  return Platform.OS === "web" ? undefined : value;
}
