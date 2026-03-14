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
import { Button } from "../components/ui/Button";
import { Typography } from "../components/ui/Typography";
import { TextField } from "../components/ui/TextField";
import { Theme } from "../constants/DesignSystem";
import { AxiosError } from "axios";

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
      const errorMessage =
        err instanceof AxiosError
          ? err.response?.data?.error
          : "Failed to reset password";
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
      {" "}
      <View style={styles.formContainer}>
        <Typography variant="h1" align="center" style={styles.title}>
          Reset Password
        </Typography>
        <Typography
          variant="body"
          color={Theme.colors.textMuted}
          align="center"
          style={styles.subtitle}
        >
          Enter the token from your email and your new password
        </Typography>

        {error ? (
          <View style={styles.errorContainer}>
            <Typography variant="caption" color={Theme.colors.error}>
              {error}
            </Typography>
          </View>
        ) : null}

        <TextField
          label="Reset Token"
          placeholder="Enter the 6-digit token"
          value={token}
          onChangeText={setToken}
          icon="key-outline"
        />
        <TextField
          label="New Password"
          placeholder="Enter your new password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          icon="lock-closed-outline"
        />

        <Button
          title="Reset Password"
          onPress={handleReset}
          isLoading={isLoading}
          style={styles.button}
        />

        <Pressable
          onPress={() => router.replace("/login")}
          style={styles.backBtn}
        >
          <Typography
            variant="body"
            align="center"
            color={Theme.colors.textMuted}
          >
            Back to{" "}
            <Typography color={Theme.colors.primary} weight="800">
              Sign In
            </Typography>
          </Typography>
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
  formContainer: {
    // Renamed from form
    paddingHorizontal: 32,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 32,
  },
  errorContainer: {
    // Renamed from errorBox
    backgroundColor: "rgba(255, 59, 59, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 59, 0.2)",
  },
  button: {
    marginTop: 12,
    marginBottom: 24,
  },
  backBtn: {
    // New style
    marginTop: 16,
  },
});
