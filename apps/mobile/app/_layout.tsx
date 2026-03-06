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
  type AppStateStatus,
} from "react-native";
import * as Sentry from "@sentry/react-native";
import {
  restoreQueryCache,
  persistQueryCache,
} from "../services/queryPersister";
import "../global.css";

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

function RootLayout() {
  const appState = useRef(AppState.currentState);

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

    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#000000" },
          headerTintColor: "#ffffff",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#000000" },
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
          name="player"
          options={{
            title: "Now Playing",
            headerShown: false,
            presentation: "fullScreenModal",
          }}
        />
      </Stack>
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
    shadowColor: "#818cf8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  retryButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 16 },
});
