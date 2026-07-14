import { useWindowClass } from "./useWindowClass";

/** Responsive column count based on screen width */
export function useResponsiveColumns(): number {
  const { windowClass } = useWindowClass();
  if (windowClass === "large") return 6;
  if (windowClass === "expanded") return 4;
  if (windowClass === "medium") return 3;
  return 2;
}
