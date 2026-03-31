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

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    setError("");

    if (!token || !newPassword) {
      setError("Please enter the token and a new password");
      return;
    }

    try {
      setIsLoading(true);
      await resetPassword({ token, newPassword });
      alert("Password reset successfully! Please log in.");
      router.replace("/login");
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage || "Failed to reset password");
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
        <Text style={styles.title}>New Password</Text>
        <Text style={styles.subtitle}>
          Enter the reset token and your new password
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Reset Token"
          placeholderTextColor="#6b7280"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="New Password (min 8 chars)"
          placeholderTextColor="#6b7280"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Reset Password</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.replace("/login")}
          style={{ marginTop: 12 }}
        >
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
