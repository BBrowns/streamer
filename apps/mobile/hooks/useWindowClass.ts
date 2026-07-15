import { useWindowDimensions } from "react-native";

export type WindowClass = "compact" | "medium" | "expanded" | "large";

export function getWindowClass(width: number): WindowClass {
  if (width < 600) return "compact";
  if (width < 840) return "medium";
  if (width < 1200) return "expanded";
  return "large";
}

export function useWindowClass() {
  const dimensions = useWindowDimensions();
  const windowClass = getWindowClass(dimensions.width);

  return {
    ...dimensions,
    windowClass,
    isCompact: windowClass === "compact",
    isMedium: windowClass === "medium",
    isExpanded: windowClass === "expanded",
    isLarge: windowClass === "large",
    hasSideNavigation: windowClass !== "compact",
  };
}
