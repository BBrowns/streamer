import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authService } from "../services/authService";
import { useAuth } from "../hooks/useAuth";
import { useTranslation } from "react-i18next";

import { useTheme } from "../hooks/useTheme";

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const { logout } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  const handleResend = async () => {
    if (!email) return;
    setIsResending(true);
    setResendStatus("idle");
    try {
      await authService.resendVerification({ email });
      setResendStatus("success");
    } catch (err) {
      console.error("Failed to resend verification", err);
      setResendStatus("error");
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToLogin = () => {
    logout();
    router.replace("/login");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: isDark
                ? "rgba(137, 180, 250, 0.1)"
                : colors.tint + "15",
            },
          ]}
        >
          <Ionicons name="mail-open-outline" size={48} color={colors.tint} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("auth.verifyEmail.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t("auth.verifyEmail.subtitle")}
          {"\n"}
          <Text style={[styles.emailText, { color: colors.tint }]}>
            {email || t("auth.verifyEmail.yourEmail")}
          </Text>
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {t("auth.verifyEmail.description")}
        </Text>

        {resendStatus === "success" && (
          <View
            style={[
              styles.successBox,
              {
                backgroundColor: isDark
                  ? "rgba(166, 227, 161, 0.1)"
                  : "rgba(34, 197, 94, 0.1)",
              },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={isDark ? "#a6e3a1" : "#166534"}
            />
            <Text
              style={[
                styles.successText,
                { color: isDark ? "#a6e3a1" : "#166534" },
              ]}
            >
              {t("auth.verifyEmail.resendSuccess")}
            </Text>
          </View>
        )}

        {resendStatus === "error" && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color="#ef4444" />
            <Text style={styles.errorText}>
              {t("auth.verifyEmail.resendError")}
            </Text>
          </View>
        )}

        <Pressable
          style={[
            styles.resendButton,
            { backgroundColor: colors.tint },
            isResending && styles.disabledButton,
          ]}
          onPress={handleResend}
          disabled={isResending}
        >
          {isResending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={[styles.resendText, { color: "#fff" }]}>
                {t("auth.verifyEmail.resendButton")}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.backButton} onPress={handleBackToLogin}>
          <Text style={[styles.backText, { color: colors.textSecondary }]}>
            {t("auth.verifyEmail.backToLogin")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#11111b",
    padding: 24,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(137, 180, 250, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#cdd6f4",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#a6adc8",
    textAlign: "center",
    lineHeight: 24,
  },
  emailText: {
    color: "#89b4fa",
    fontWeight: "600",
  },
  content: {
    width: "100%",
  },
  description: {
    fontSize: 15,
    color: "#9399b2",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  resendButton: {
    backgroundColor: "#89b4fa",
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  disabledButton: {
    opacity: 0.7,
  },
  resendText: {
    color: "#11111b",
    fontSize: 16,
    fontWeight: "700",
  },
  backButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  backText: {
    color: "#a6adc8",
    fontSize: 15,
    fontWeight: "600",
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(166, 227, 161, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  successText: {
    color: "#a6e3a1",
    fontSize: 14,
    fontWeight: "600",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(243, 139, 168, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  errorText: {
    color: "#f38ba8",
    fontSize: 14,
    fontWeight: "600",
  },
});
