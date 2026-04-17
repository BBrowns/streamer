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
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/error";

import { useTheme } from "../hooks/useTheme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { forgotPassword } = useAuth();
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleForgot = async () => {
    setError("");
    setSuccessMessage("");

    if (!email) {
      setError(t("auth.errors.fillFields"));
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
        setSuccessMessage(res.message || t("auth.forgot.success"));
      }
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage || t("auth.forgot.error"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.form}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("auth.forgot.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t("auth.forgot.subtitle")}
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
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
            <Text
              style={[
                styles.successText,
                { color: isDark ? "#a6e3a1" : "#166534" },
              ]}
            >
              {successMessage}
            </Text>
            <Pressable
              style={[
                styles.button,
                { marginTop: 16, backgroundColor: colors.tint },
              ]}
              onPress={() => router.push("/reset-password")}
            >
              <Text style={[styles.buttonText, { color: "#fff" }]}>
                {t("auth.register.button")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder={t("auth.login.email")}
              placeholderTextColor={colors.textSecondary + "80"}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Pressable
              style={[
                styles.button,
                { backgroundColor: colors.tint },
                isLoading && styles.buttonDisabled,
              ]}
              onPress={handleForgot}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.buttonText, { color: "#fff" }]}>
                  {t("auth.forgot.button")}
                </Text>
              )}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={[styles.linkText, { color: colors.textSecondary }]}>
            <Text style={[styles.linkBold, { color: colors.tint }]}>
              {t("auth.forgot.back")}
            </Text>
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
