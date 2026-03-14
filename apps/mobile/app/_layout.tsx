import { Stack, ErrorBoundaryProps } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import * as SplashScreen from "expo-splash-screen";
import {
  View,
  Text,
  Pressable,
  AppState,
  StyleSheet,
  Platform,
  useWindowDimensions,
  type AppStateStatus,
} from "react-native";
import * as Sentry from "@sentry/react-native";
import {
  restoreQueryCache,
  persistQueryCache,
} from "../services/queryPersister";
import { Ionicons } from "@expo/vector-icons";
import "../global.css";
import { DesktopLayout } from "../components/ui/DesktopLayout";
import { useAuthStore } from "../stores/authStore";
import { downloadService } from "../services/DownloadService";

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
      <Ionicons
        name="alert-circle-outline"
        size={48}
        color="#ef4444"
        style={{ marginBottom: 12 }}
      />
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

function RootLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width > 1024;
  const appState = useRef(AppState.currentState);
  const { deviceId, setDeviceId } = useAuthStore();

  useEffect(() => {
    if (!deviceId) {
      const newId =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      setDeviceId(newId);
    }
  }, [deviceId]);

  useEffect(() => {
    // Restore offline cache then hide splash
    restoreQueryCache(queryClient)
      .catch(() => {
        /* non-critical */
      })
      .finally(() => SplashScreen.hideAsync().catch(() => {}));

    // Persist cache when app goes to background
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current === "active" && next.match(/inactive|background/)) {
        persistQueryCache(queryClient).catch(() => {
          /* non-critical */
        });
      }
      appState.current = next;
    });

    // Initialize download service (bridge polling)
    downloadService.initialize().catch(() => {});

    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <DesktopLayout>
        <Stack
          screenOptions={{
            headerShown: !isDesktop, // Hide header on desktop
            headerStyle: { backgroundColor: "#010101" },
            headerTintColor: "#ffffff",
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: "#010101" },
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
            name="login"
            options={{ title: "Sign In", presentation: "modal" }}
          />
          <Stack.Screen
            name="register"
            options={{ title: "Create Account", presentation: "modal" }}
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
            name="settings/change-password"
            options={{ title: "Change Password" }}
          />
          <Stack.Screen
            name="settings/edit-profile"
            options={{ title: "Edit Profile" }}
          />
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
    boxShadow: [
      {
        color: "rgba(129, 140, 248, 0.4)",
        offsetX: 0,
        offsetY: 4,
        blurRadius: 10,
      },
    ],
    elevation: 6,
  },
  retryButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 16 },
});
