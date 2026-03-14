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
import { GlassPanel } from "../components/ui/GlassPanel";
import { Theme } from "../constants/DesignSystem";
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
      {" "}
      <View style={styles.formContainer}>
        <Typography variant="h1" align="center" style={styles.title}>
          Forgot Password
        </Typography>
        <Typography
          variant="body"
          color={Theme.colors.textMuted}
          align="center"
          style={styles.subtitle}
        >
          Enter your email to receive a reset link
        </Typography>

        {error ? (
          <View style={styles.errorContainer}>
            <Typography variant="caption" color={Theme.colors.error}>
              {error}
            </Typography>
          </View>
        ) : null}

        {successMessage ? (
          <GlassPanel style={styles.successBox}>
            <Typography
              variant="body"
              align="center"
              color={Theme.colors.success}
              style={styles.successText}
            >
              {successMessage}
            </Typography>
            <Button
              title="Enter token"
              onPress={() => router.push("/reset-password")}
              variant="secondary"
              style={{ marginTop: 16 }}
            />
          </GlassPanel>
        ) : (
          <>
            <TextField
              label="Email Address"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              icon="mail-outline"
            />

            <Button
              title="Send Reset Link"
              onPress={handleForgot}
              isLoading={isLoading}
              style={styles.button}
            />
          </>
        )}

        <Pressable onPress={() => router.push("/login")} style={styles.backBtn}>
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
    backgroundColor: "rgba(255, 59, 59, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 59, 0.2)",
  },
  successBox: {
    padding: 20,
    marginBottom: 24,
    backgroundColor: "rgba(0, 255, 136, 0.05)",
    borderColor: "rgba(0, 255, 136, 0.2)",
  },
  successText: {
    marginBottom: 8,
  },
  button: {
    marginTop: 12,
    marginBottom: 24,
  },
  backBtn: {
    marginTop: 16,
  },
});
