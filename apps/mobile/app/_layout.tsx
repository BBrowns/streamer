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
  type AppStateStatus,
} from "react-native";
import * as Sentry from "@sentry/react-native";
import {
  restoreQueryCache,
  persistQueryCache,
} from "../services/queryPersister";
import "../global.css";

SplashScreen.preventAutoHideAsync();

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || "",
  tracesSampleRate: 1.0,
  debug: __DEV__,
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
    <View className="flex-1 bg-background justify-center items-center p-8">
      <Text className="text-[48px] mb-3">⚠️</Text>
      <Text className="text-error text-xl font-bold mb-2">
        Something went wrong
      </Text>
      <Text className="text-textMuted text-sm text-center mb-6 leading-5">
        {error.message || "An unexpected error occurred."}
      </Text>
      <Pressable
        className="bg-primary px-6 py-3.5 rounded-xl shadow-lg shadow-primary/40"
        onPress={retry}
      >
        <Text className="text-white font-bold text-base">Try Again</Text>
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
      .finally(() => SplashScreen.hideAsync());

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
          headerStyle: { backgroundColor: "#0a0a1a" },
          headerTintColor: "#e0e0ff",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#0a0a1a" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
