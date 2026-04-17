import { Stack, ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import {
  View,
  Text,
  Pressable,
  AppState,
  StyleSheet,
  Platform,
  type AppStateStatus,
} from "react-native";
import * as Sentry from "@sentry/react-native";
import {
  restoreQueryCache,
  persistQueryCache,
} from "../services/queryPersister";
import "../global.css";
import { DesktopLayout } from "../components/ui/DesktopLayout";
import { useAuthStore } from "../stores/authStore";
import { ToastContainer } from "../components/ui/ToastContainer";
import "../lib/i18n";
import { CommandPalette } from "../components/ui/CommandPalette";
import { useAuth } from "../hooks/useAuth";
import { useSync } from "../hooks/useSync";
import { useTheme } from "../hooks/useTheme";
import { migrateTokensToSecureStorage } from "../services/secureStorage";
import { BiometricLockOverlay } from "../components/ui/BiometricLockOverlay";
import { RemoteControlBar } from "../components/player/RemoteControlBar";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* Expo Go may not have a native splash screen registered */
});

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || "",
  tracesSampleRate: __DEV__ ? 0 : 1.0,
  debug: false, // disable verbose Sentry console spam in dev
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN, // only enable if DSN is set
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000, // Keep data in cache for offline use
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
    },
  },
});

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorEmoji}>⚠️</Text>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>
        {error.message || "An unexpected error occurred."}
      </Text>
      <Pressable style={styles.retryButton} onPress={retry}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

function RootLayoutNav() {
  const appState = useRef(AppState.currentState);
  const { isDark, colors: themeColors } = useTheme();
  const deviceId = useAuthStore((s) => s.deviceId);
  const setDeviceId = useAuthStore((s) => s.setDeviceId);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global hooks MUST be inside QueryClientProvider
  useAuth();
  useSync();

  useEffect(() => {
    if (isHydrated && !deviceId) {
      const newId =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      setDeviceId(newId);
    }
  }, [deviceId, isHydrated]);

  useEffect(() => {
    // 1. One-time migration from plain AsyncStorage to SecureStore (idempotent)
    migrateTokensToSecureStorage()
      .then(() => {
        // 2. Load tokens into memory from SecureStore
        return useAuthStore.getState().loadTokensFromSecureStore();
      })
      .then(() => {
        // 3. Restore offline cache
        return restoreQueryCache(queryClient);
      })
      .then(async () => {
        // 4. Check onboarding status
        const hasSeenOnboarding = await AsyncStorage.getItem(
          "HAS_SEEN_ONBOARDING",
        );
        if (!hasSeenOnboarding) {
          const { router } = require("expo-router");
          router.replace("/onboarding");
        }
      })
      .finally(() => {
        // 5. Hide splash screen once essentials are loaded
        SplashScreen.hideAsync().catch(() => {});
      });

    // Persist cache when app goes to background
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current === "active" && next.match(/inactive|background/)) {
        persistQueryCache(queryClient).catch(() => {
          /* non-critical */
        });
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, []);

  // ⌘K / Ctrl+K keyboard shortcut for global search
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };

    const { DeviceEventEmitter } = require("react-native");
    const sub = DeviceEventEmitter.addListener("SHOW_SEARCH", () => {
      setSearchOpen(true);
    });

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      sub.remove();
    };
  }, []);

  return (
    <RootLayoutNavInner>
      <DesktopLayout onSearchOpen={() => setSearchOpen(true)}>
        <CommandPalette
          visible={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
        <ToastContainer />
        <BiometricLockOverlay />
        <StatusBar style={isDark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: themeColors.header },
            headerTintColor: themeColors.text,
            headerTitleStyle: { fontWeight: "700" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: themeColors.background },
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              title: "",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, animation: "fade" }}
          />
          <Stack.Screen
            name="login"
            options={{ title: "Sign In", presentation: "modal" }}
          />
          <Stack.Screen
            name="register"
            options={{ title: "Create Account", presentation: "modal" }}
          />
          <Stack.Screen
            name="notifications"
            options={{ title: "Notifications", presentation: "modal" }}
          />
          <Stack.Screen
            name="forgot-password"
            options={{ title: "Forgot Password", presentation: "modal" }}
          />
          <Stack.Screen
            name="reset-password"
            options={{ title: "Reset Password", presentation: "modal" }}
          />
          <Stack.Screen name="detail/[type]/[id]" options={{ title: "" }} />
          <Stack.Screen name="addons/index" options={{ title: "Add-ons" }} />
          <Stack.Screen
            name="player"
            options={{
              title: "Now Playing",
              headerShown: false,
              presentation: "fullScreenModal",
            }}
          />
        </Stack>
      </DesktopLayout>
      <RemoteControlBar />
    </RootLayoutNavInner>
  );
}

// Wrapper for layout elements that need to be inside providers but outside Navigation
function RootLayoutNavInner({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootLayoutNav />
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: "#050510",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorTitle: {
    color: "#ef4444",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  errorMessage: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: "#818cf8",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 16 },
});
