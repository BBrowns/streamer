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
import { extractErrorMessage } from "../utils/error";

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
      const normalizedEmail = email.toLowerCase().trim();
      const res = await forgotPassword({ email: normalizedEmail });

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
      const errorMessage = extractErrorMessage(err);
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
    backgroundColor: "#11111b",
    justifyContent: "center",
  },
  form: {
    paddingHorizontal: 32,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#cdd6f4",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#a6adc8",
    marginBottom: 32,
    lineHeight: 22,
  },
  errorBox: {
    backgroundColor: "rgba(243, 139, 168, 0.1)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: "#f38ba8",
    fontSize: 14,
    fontWeight: "600",
  },
  successBox: {
    backgroundColor: "rgba(166, 227, 161, 0.1)",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  successText: {
    color: "#a6e3a1",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#1e1e2e",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: "#cdd6f4",
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(137, 180, 250, 0.1)",
  },
  button: {
    backgroundColor: "#89b4fa",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#11111b",
    fontWeight: "700",
    fontSize: 16,
  },
  linkText: {
    color: "#a6adc8",
    textAlign: "center",
    fontSize: 14,
  },
  linkBold: {
    color: "#89b4fa",
    fontWeight: "700",
  },
});
