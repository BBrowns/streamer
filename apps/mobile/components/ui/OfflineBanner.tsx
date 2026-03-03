import { useEffect, useState, useRef } from "react";
import { View, Text, Animated, StyleSheet, Platform } from "react-native";

/**
 * Offline banner component.
 *
 * Listens to network connectivity changes and displays a persistent
 * banner when the device loses internet connection.
 *
 * Uses `navigator.onLine` on web and `expo-network` on native platforms.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (Platform.OS === "web") {
      // Web: use navigator.onLine + events
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);

      if (typeof window !== "undefined") {
        setIsOffline(!navigator.onLine);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        cleanup = () => {
          window.removeEventListener("online", handleOnline);
          window.removeEventListener("offline", handleOffline);
        };
      }
    } else {
      // Native: use expo-network (lazy import to avoid web crash)
      let mounted = true;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      (import("expo-network") as Promise<any>)
        .then((Network: any) => {
          if (!mounted) return;

          // Check initial state
          Network.getNetworkStateAsync().then(
            (state: { isInternetReachable: boolean | null }) => {
              if (mounted) setIsOffline(!state.isInternetReachable);
            },
          );

          // Subscribe to changes
          const sub = Network.addNetworkStateListener(
            (state: { isInternetReachable: boolean | null }) => {
              if (mounted) setIsOffline(!state.isInternetReachable);
            },
          );

          cleanup = () => {
            mounted = false;
            sub.remove();
          };
        })
        .catch(() => {
          // expo-network not available — silently ignore
          mounted = false;
        });

      return () => {
        mounted = false;
        cleanup?.();
      };
    }

    return cleanup;
  }, []);

  // Animate banner slide in/out
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -50,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
      accessibilityRole="alert"
      accessibilityLabel="You are offline. Showing cached content."
      accessibilityLiveRegion="assertive"
    >
      <Text style={styles.icon}>📡</Text>
      <Text style={styles.text}>You're offline — showing cached content</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#f59e0b",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 999,
  },
  icon: {
    fontSize: 14,
    marginRight: 8,
  },
  text: {
    color: "#0a0a1a",
    fontSize: 13,
    fontWeight: "600",
  },
});
