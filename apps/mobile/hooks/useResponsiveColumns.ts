import { useWindowDimensions } from "react-native";

/** Responsive column count based on screen width */
export function useResponsiveColumns(): number {
  const { width } = useWindowDimensions();
  if (width >= 1280) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 480) return 3;
  return 2;
}
