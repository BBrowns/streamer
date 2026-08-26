import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

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

    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReducedTransparency,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedTransparency;
}
