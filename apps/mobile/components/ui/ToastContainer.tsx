import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useToastStore,
  type Toast,
  type ToastType,
} from "../../stores/toastStore";

// ─── Individual Toast ─────────────────────────────────────────────────────────
function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToastStore();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        useNativeDriver: true,
        tension: 120,
        friction: 10,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 10,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -10,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, 3200);

    return () => clearTimeout(timer);
  }, []);

  const icon: Record<ToastType, React.ComponentProps<typeof Ionicons>["name"]> =
    {
      success: "checkmark-circle",
      error: "alert-circle",
      info: "information-circle",
    };
  const color: Record<ToastType, string> = {
    success: "#4ade80",
    error: "#f87171",
    info: "#00f2ff",
  };

  return (
    <Animated.View
      style={[styles.toast, { opacity, transform: [{ translateY }] }]}
    >
      <Ionicons name={icon[toast.type]} size={20} color={color[toast.type]} />
      <Text style={styles.message} numberOfLines={2}>
        {toast.message}
      </Text>
      <Pressable onPress={() => dismiss(toast.id)} hitSlop={8}>
        <Ionicons name="close" size={16} color="#6b7280" />
      </Pressable>
    </Animated.View>
  );
}

// ─── Toast Container ──────────────────────────────────────────────────────────
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 100 : 24,
    right: 24,
    zIndex: 9999,
    gap: 8,
    maxWidth: 360,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#16161f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  message: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
});
