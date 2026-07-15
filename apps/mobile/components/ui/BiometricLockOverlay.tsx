import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  AppState,
} from "react-native";
import { useEffect, useState, useRef } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { getWebFocusStyle } from "./designSystem";

export function BiometricLockOverlay() {
  const { biometricEnabled, isAuthenticated, lastActiveAt, setLastActive } =
    useAuthStore();
  const [isLocked, setIsLocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const { colors } = useTheme();
  const { t } = useTranslation();

  const BIOMETRIC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  // Challenge on mount and background->foreground
  useEffect(() => {
    if (Platform.OS === "web" || !biometricEnabled || !isAuthenticated) {
      setIsLocked(false);
      return;
    }

    const checkLock = () => {
      const now = Date.now();
      const needsLock =
        !lastActiveAt || now - lastActiveAt > BIOMETRIC_TIMEOUT_MS;

      if (needsLock) {
        setIsLocked(true);
        triggerUnlock();
      }
    };

    // Initial check on mount
    checkLock();

    const sub = AppState.addEventListener("change", (next) => {
      if (
        appState.current.match(/active/) &&
        next.match(/inactive|background/)
      ) {
        // App is being backgrounded - record time
        setLastActive(Date.now());
      }

      if (appState.current.match(/inactive|background/) && next === "active") {
        // App is being foregrounded - check if timeout exceeded
        checkLock();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [biometricEnabled, isAuthenticated, lastActiveAt]);

  const triggerUnlock = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t("biometricLock.prompt"),
        cancelLabel: t("common.cancel"),
        fallbackLabel: t("biometricLock.usePin"),
      });
      if (result.success) {
        setIsLocked(false);
      }
    } catch (e) {
      console.warn("Biometric challenge failed", e);
    }
  };

  if (!isLocked) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Ionicons name="lock-closed" size={64} color={colors.tint} />
        <Text style={[styles.title, { color: colors.text }]}>
          {t("biometricLock.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t("biometricLock.subtitle")}
        </Text>
        <Pressable
          style={({ pressed, focused }: any) => [
            styles.button,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.76 },
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={triggerUnlock}
          accessibilityRole="button"
          accessibilityLabel={t("biometricLock.unlock")}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>
            {t("biometricLock.unlock")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    padding: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
});
