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

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const { logout } = useAuth();

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
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="mail-open-outline" size={48} color="#89b4fa" />
        </View>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We've sent a verification link to{"\n"}
          <Text style={styles.emailText}>{email || "your email"}</Text>
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>
          Please check your inbox and click the link to activate your account.
          If you don't see the email, check your spam folder.
        </Text>

        {resendStatus === "success" && (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={20} color="#a6e3a1" />
            <Text style={styles.successText}>New link sent successfully!</Text>
          </View>
        )}

        {resendStatus === "error" && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color="#f38ba8" />
            <Text style={styles.errorText}>
              Failed to send. Please try again.
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.resendButton, isResending && styles.disabledButton]}
          onPress={handleResend}
          disabled={isResending}
        >
          {isResending ? (
            <ActivityIndicator color="#11111b" />
          ) : (
            <>
              <Ionicons name="refresh" size={20} color="#11111b" />
              <Text style={styles.resendText}>Resend Email</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.backButton} onPress={handleBackToLogin}>
          <Text style={styles.backText}>Back to Login</Text>
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
