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
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import { getWebFocusStyle } from "./designSystem";

// ─── Individual Toast ─────────────────────────────────────────────────────────
function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToastStore();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const reducedMotion = useReducedMotion();
  const { colors } = useTheme();
  const { t } = useTranslation();

  useEffect(() => {
    const enter = Animated.parallel([
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
    ]);
    if (reducedMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
    } else {
      enter.start();
    }

    const timer = setTimeout(
      () => {
        if (reducedMotion) {
          dismiss(toast.id);
          return;
        }
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
      },
      Math.max(0, (toast.duration ?? 3500) - 300),
    );

    return () => clearTimeout(timer);
  }, [dismiss, opacity, reducedMotion, toast.id, translateY]);

  const icon: Record<ToastType, React.ComponentProps<typeof Ionicons>["name"]> =
    {
      success: "checkmark-circle",
      error: "alert-circle",
      info: "information-circle",
    };
  const color: Record<ToastType, string> = {
    success: colors.success,
    error: colors.error,
    info: colors.tint,
  };

  return (
    <Animated.View
      accessibilityLiveRegion={toast.type === "error" ? "assertive" : "polite"}
      accessibilityRole={toast.type === "error" ? "alert" : "none"}
      style={[
        styles.toast,
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
    >
      <Ionicons name={icon[toast.type]} size={20} color={color[toast.type]} />
      <Text style={[styles.message, { color: colors.text }]} numberOfLines={2}>
        {toast.message}
      </Text>
      {!!toast.actionLabel && !!toast.onAction && (
        <Pressable
          onPress={() => {
            dismiss(toast.id);
            void toast.onAction?.();
          }}
          style={({ pressed, focused }: any) => [
            styles.action,
            pressed && styles.pressed,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          accessibilityRole="button"
          accessibilityLabel={toast.actionLabel}
        >
          <Text style={[styles.actionText, { color: colors.tint }]}>
            {toast.actionLabel}
          </Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => dismiss(toast.id)}
        accessibilityRole="button"
        accessibilityLabel={t("notifications.dismiss")}
        style={({ pressed, focused }: any) => [
          styles.dismiss,
          pressed && styles.pressed,
          Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
        ]}
      >
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Toast Container ──────────────────────────────────────────────────────────
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        Platform.OS === "web" ? styles.webPassThrough : styles.nativeBoxNone,
      ]}
    >
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
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
        }),
    elevation: 10,
    pointerEvents: "auto",
  } as any,
  webPassThrough: {
    pointerEvents: "none",
  },
  nativeBoxNone: {
    pointerEvents: "box-none",
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  action: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "800",
  },
  dismiss: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
});
