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
import { useAuthStore } from "../../stores/authStore";

export function BiometricLockOverlay() {
  const { biometricEnabled, isAuthenticated } = useAuthStore();
  const [isLocked, setIsLocked] = useState(false);
  const appState = useRef(AppState.currentState);

  // Challenge on mount and background->foreground
  useEffect(() => {
    if (Platform.OS === "web" || !biometricEnabled || !isAuthenticated) {
      setIsLocked(false);
      return;
    }

    const checkLock = () => {
      setIsLocked(true);
      triggerUnlock();
    };

    // Initial check
    checkLock();

    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        checkLock();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [biometricEnabled, isAuthenticated]);

  const triggerUnlock = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Streamer",
        cancelLabel: "Cancel",
        fallbackLabel: "Use Device PIN",
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
    <View style={styles.overlay}>
      <View style={styles.content}>
        <Ionicons name="lock-closed" size={64} color="#818cf8" />
        <Text style={styles.title}>App Locked</Text>
        <Text style={styles.subtitle}>
          Use your device biometrics to unlock.
        </Text>
        <Pressable style={styles.button} onPress={triggerUnlock}>
          <Text style={styles.buttonText}>Unlock</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#050510",
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    padding: 32,
  },
  title: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
  },
  button: {
    backgroundColor: "#818cf8",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
