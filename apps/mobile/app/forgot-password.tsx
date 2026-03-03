import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { AxiosError } from "axios";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleForgot = async () => {
    setError("");
    setSuccessMessage("");

    if (!email) {
      setError("Please enter your email address");
      return;
    }

    try {
      setIsLoading(true);
      const res = await forgotPassword({ email });

      // In a real app, you would send an email.
      // Here, the backend might return the token in dev mode.
      if (res.resetToken) {
        setSuccessMessage(
          `Reset token generated (Dev Mode): ${res.resetToken}`,
        );
      } else {
        setSuccessMessage(
          res.message || "Check your email for reset instructions.",
        );
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError
          ? err.response?.data?.error
          : "Failed to request password reset";
      setError(errorMessage || "Failed to request password reset");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.form}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email to receive a reset link
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{successMessage}</Text>
            <Pressable
              style={[styles.button, { marginTop: 16 }]}
              onPress={() => router.push("/reset-password")}
            >
              <Text style={styles.buttonText}>Enter token</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#6b7280"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Pressable
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleForgot}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send Reset Link</Text>
              )}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>
            <Text style={styles.linkBold}>Back to Login</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a1a",
    justifyContent: "center",
  },
  form: {
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#e0e0ff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 28,
  },
  errorBox: {
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#f87171",
    fontSize: 13,
  },
  successBox: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  successText: {
    color: "#34d399",
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: "#1a1a3e",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#e0e0ff",
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.2)",
  },
  button: {
    backgroundColor: "#818cf8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    boxShadow: "0px 4px 8px rgba(129, 140, 248, 0.3)",
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  linkText: {
    color: "#9ca3af",
    textAlign: "center",
    fontSize: 13,
  },
  linkBold: {
    color: "#818cf8",
    fontWeight: "700",
  },
});
