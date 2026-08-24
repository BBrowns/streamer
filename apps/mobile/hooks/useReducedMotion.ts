import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useAuthStore } from "../stores/authStore";

export function useReducedMotion() {
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const forceReducedMotion = useAuthStore((state) => state.forceReducedMotion);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setSystemReducedMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setSystemReducedMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return systemReducedMotion || forceReducedMotion;
}
