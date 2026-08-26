import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/**
 * Reduce Transparency is an OS accessibility preference on iOS. Other
 * runtimes either expose the same signal or resolve to the safe opaque
 * fallback below. Keeping the capability check here prevents material
 * components from importing platform-specific accessibility details.
 */
export function useReducedTransparency() {
  const [reducedTransparency, setReducedTransparency] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      let mediaQuery: MediaQueryList | undefined;
      try {
        mediaQuery = window.matchMedia?.(
          "(prefers-reduced-transparency: reduce)",
        );
      } catch {
        mediaQuery = undefined;
      }

      if (mediaQuery) {
        setReducedTransparency(mediaQuery.matches);
        const handleChange = (event: MediaQueryListEvent) => {
          if (mounted) setReducedTransparency(event.matches);
        };
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener("change", handleChange);
        } else {
          mediaQuery.addListener?.(handleChange);
        }

        return () => {
          mounted = false;
          if (mediaQuery?.removeEventListener) {
            mediaQuery.removeEventListener("change", handleChange);
          } else {
            mediaQuery?.removeListener?.(handleChange);
          }
        };
      }

      return () => {
        mounted = false;
      };
    }

    const accessibilityInfo = AccessibilityInfo as typeof AccessibilityInfo & {
      isReduceTransparencyEnabled?: () => Promise<boolean>;
    };

    if (typeof accessibilityInfo.isReduceTransparencyEnabled === "function") {
      void accessibilityInfo
        .isReduceTransparencyEnabled()
        .then((enabled) => {
          if (mounted) setReducedTransparency(enabled);
        })
        .catch(() => {
          // Unsupported runtimes keep the normal material policy.
        });
    }

    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceTransparencyChanged",
      setReducedTransparency,
    );

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return reducedTransparency;
}
