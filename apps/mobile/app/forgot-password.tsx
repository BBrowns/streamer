import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/error";

import { useTheme } from "../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { AuthScaffold } from "../components/auth/AuthScaffold";
import { BackendUrlField } from "../components/auth/BackendUrlField";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { forgotPassword } = useAuth();
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [resetToken, setResetToken] = useState("");

  const handleForgot = async () => {
    setError("");
    setSuccessMessage("");
    setResetToken("");

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
        setResetToken(res.resetToken);
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
    <AuthScaffold
      title={t("auth.forgot.title")}
      subtitle={t("auth.forgot.subtitle")}
      image={require("../assets/images/onboarding_security.png")}
      icon="key-outline"
    >
      <View>
        {error ? (
          <View
            style={[
              styles.messageBox,
              { backgroundColor: colors.error + "18" },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View
            style={[
              styles.messageBoxLarge,
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
                styles.primaryButton,
                { marginTop: 16, backgroundColor: colors.tint },
              ]}
              onPress={() =>
                resetToken
                  ? router.push({
                      pathname: "/reset-password",
                      params: { token: resetToken },
                    })
                  : router.push("/reset-password")
              }
            >
              <Ionicons name="arrow-forward" size={18} color="#2c1738" />
              <Text style={styles.primaryButtonText}>
                {t("auth.resetPassword.submit")}
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
                styles.primaryButton,
                { backgroundColor: colors.tint },
                isLoading && styles.disabledButton,
              ]}
              onPress={handleForgot}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#2c1738" />
              ) : (
                <>
                  <Ionicons name="mail-outline" size={18} color="#2c1738" />
                  <Text style={styles.primaryButtonText}>
                    {t("auth.forgot.button")}
                  </Text>
                </>
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
        <BackendUrlField />
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  messageBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  errorText: {
    color: "#ff9ba6",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  messageBoxLarge: {
    borderRadius: 18,
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
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 8,
    marginBottom: 24,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#2c1738",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0,
  },
  linkText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
  },
  linkBold: {
    fontWeight: "900",
  },
});
