import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";

interface UseKeyboardNavigationProps {
  itemCount: number;
  columns?: number;
  onSelect?: (index: number) => void;
  isActive?: boolean;
}

/**
 * A hook to enable keyboard navigation (arrow keys + enter) for grid layouts.
 * Particularly useful for Desktop/Web power users.
 */
export function useKeyboardNavigation({
  itemCount,
  columns = 1,
  onSelect,
  isActive = true,
}: UseKeyboardNavigationProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isActive || itemCount === 0) return;

      switch (event.key) {
        case "ArrowRight":
          setSelectedIndex((prev) => (prev + 1 >= itemCount ? prev : prev + 1));
          event.preventDefault();
          break;
        case "ArrowLeft":
          setSelectedIndex((prev) => (prev - 1 < 0 ? 0 : prev - 1));
          event.preventDefault();
          break;
        case "ArrowDown":
          setSelectedIndex((prev) => {
            const next = prev + columns;
            return next >= itemCount ? prev : next;
          });
          event.preventDefault();
          break;
        case "ArrowUp":
          setSelectedIndex((prev) => {
            const next = prev - columns;
            return next < 0 ? 0 : next;
          });
          event.preventDefault();
          break;
        case "Enter":
          if (selectedIndex >= 0 && onSelect) {
            onSelect(selectedIndex);
            event.preventDefault();
          }
          break;
        case "Escape":
          setSelectedIndex(-1);
          break;
      }
    },
    [itemCount, columns, onSelect, isActive, selectedIndex],
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return {
    selectedIndex,
    setSelectedIndex,
  };
}
