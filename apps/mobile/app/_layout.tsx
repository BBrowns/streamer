import { Stack, ErrorBoundaryProps, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter";
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
import Constants from "expo-constants";
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
import { downloadService } from "../services/DownloadService";
import {
  createRedactedError,
  redactSensitiveText,
} from "../services/redaction";
import { createMobileSentryConfig } from "../services/sentryConfig";
import {
  clientBuildMetadata,
  clientBuildSentryTags,
} from "../services/buildMetadata";
import { clientRuntimeConfig } from "../services/runtimeConfig";
import {
  getWebFocusStyle,
  uiRadii,
  uiTypography,
} from "../components/ui/designSystem";
import { useTranslation } from "react-i18next";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* Expo Go may not have a native splash screen registered */
});

Sentry.init(
  createMobileSentryConfig({
    dsn: clientRuntimeConfig.sentry.dsn,
    appVersion: Constants.expoConfig?.version,
    environment: clientRuntimeConfig.sentry.environment,
    release: clientRuntimeConfig.sentry.release,
    tracesSampleRate: clientRuntimeConfig.sentry.tracesSampleRate,
    sampleRate: clientRuntimeConfig.sentry.errorSampleRate,
    enableInDev: clientRuntimeConfig.sentry.enableInDev,
    isDev: __DEV__,
    nodeEnv: process.env.NODE_ENV,
    buildMetadata: clientBuildMetadata,
  }),
);
Sentry.setTags(clientBuildSentryTags);
Sentry.setContext("build", { ...clientBuildMetadata });

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

const productFonts =
  Platform.OS === "web"
    ? {
        "Inter Variable": require("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
      }
    : {
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
        Inter_800ExtraBold,
        Inter_900Black,
      };

async function hydrateDesktopBridgeSettings() {
  if (Platform.OS !== "web" || !window.desktopBridge?.getBridgeInfo) return;

  try {
    const info = await window.desktopBridge.getBridgeInfo();
    const store = useAuthStore.getState();
    const bridgeUrl = info.localUrl || info.lanUrl || null;

    if (bridgeUrl && store.streamServerUrl !== bridgeUrl) {
      store.setServerUrls(undefined, bridgeUrl);
    }

    if (info.pairingToken && store.streamServerToken !== info.pairingToken) {
      await store.setStreamServerToken(info.pairingToken);
    }
  } catch {
    // Desktop bridge hydration is opportunistic; manual Sources & Devices
    // settings still work when the shell is unavailable.
  }
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  useEffect(() => {
    Sentry.captureException(createRedactedError(error));
  }, [error]);

  return (
    <View
      style={[styles.errorContainer, { backgroundColor: colors.background }]}
    >
      <Text style={styles.errorEmoji}>⚠️</Text>
      <Text style={[styles.errorTitle, { color: colors.error }]}>
        {t("common.unexpectedError.title")}
      </Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
        {t("common.unexpectedError.description")}
      </Text>
      <Pressable
        style={({ pressed, focused }: any) => [
          styles.retryButton,
          { backgroundColor: colors.primary },
          pressed && { opacity: 0.72 },
          Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
        ]}
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel={t("common.retry")}
      >
        <Text style={[styles.retryButtonText, { color: colors.onPrimary }]}>
          {t("common.retry")}
        </Text>
      </Pressable>
    </View>
  );
}

function RootLayoutNav() {
  const appState = useRef(AppState.currentState);
  const pathname = usePathname();
  const { isDark, colors: themeColors } = useTheme();
  const deviceId = useAuthStore((s) => s.deviceId);
  const setDeviceId = useAuthStore((s) => s.setDeviceId);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const [searchOpen, setSearchOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const canvas = themeColors.background;
    document.documentElement.style.backgroundColor = canvas;
    document.body.style.backgroundColor = canvas;
    document.getElementById("root")?.style.setProperty("background", canvas);
  }, [themeColors.background]);

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
        // 3. Desktop shell injects bridge URL/token so playback and cast work
        // without asking desktop users to copy pairing details manually.
        return hydrateDesktopBridgeSettings();
      })
      .then(() => {
        // 4. Restore offline cache
        return restoreQueryCache(queryClient);
      })
      .then(() => {
        // 5. Initialize Download Service (handle resumability)
        return downloadService.initialize();
      })
      .then(async () => {
        // 6. Check onboarding status
        const hasSeenOnboarding = await AsyncStorage.getItem(
          "HAS_SEEN_ONBOARDING",
        );
        const canBypassOnboarding =
          pathname.startsWith("/onboarding") ||
          pathname.startsWith("/login") ||
          pathname.startsWith("/register") ||
          pathname.startsWith("/forgot-password") ||
          pathname.startsWith("/reset-password") ||
          pathname.startsWith("/verify-email");

        if (!hasSeenOnboarding && !canBypassOnboarding) {
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
              headerBackTitle: t("navigation.back"),
            }}
          />
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, animation: "fade" }}
          />
          <Stack.Screen
            name="login"
            options={{ title: t("auth.login.button"), presentation: "modal" }}
          />
          <Stack.Screen
            name="register"
            options={{
              title: t("auth.register.title"),
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="notifications"
            options={{
              title: t("notifications.title"),
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="forgot-password"
            options={{ title: t("auth.forgot.title"), presentation: "modal" }}
          />
          <Stack.Screen
            name="reset-password"
            options={{
              title: t("auth.resetPassword.title"),
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="verify-email"
            options={{
              title: t("auth.verifyEmail.title"),
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="detail/[type]/[id]"
            options={{ headerShown: false, title: "" }}
          />
          <Stack.Screen
            name="addons/index"
            options={{ title: t("addons.title") }}
          />
          <Stack.Screen
            name="search/results"
            options={{ title: t("tabs.search") }}
          />
          <Stack.Screen
            name="player"
            options={{
              title: t("player.controls.nowPlaying"),
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
  const [fontsLoaded, fontError] = useFonts(productFonts);

  if (!fontsLoaded && !fontError) return null;

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
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorTitle: {
    ...uiTypography.title,
    marginBottom: 8,
  },
  errorMessage: {
    ...uiTypography.body,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: uiRadii.control,
  },
  retryButtonText: { ...uiTypography.control, fontSize: 16 },
});
