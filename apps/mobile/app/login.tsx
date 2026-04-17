import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/error";

import { useTheme } from "../hooks/useTheme";

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { login, isLoading, error } = useAuth();
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const handleLogin = async () => {
    setLocalError("");
    if (!email || !password) {
      setLocalError(t("auth.errors.fillFields"));
      return;
    }
    try {
      const normalizedEmail = email.toLowerCase().trim();
      await login({ email: normalizedEmail, password });
      router.replace("/(tabs)");
    } catch {}
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      enabled={Platform.OS !== "web"}
    >
      <View style={styles.formContainer}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("auth.login.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t("auth.login.subtitle")}
        </Text>

        {!!(error || localError) && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {localError || extractErrorMessage(error)}
            </Text>
          </View>
        )}

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
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder={t("auth.login.password")}
          placeholderTextColor={colors.textSecondary + "80"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={({ pressed, hovered }) => [
            styles.loginButton,
            { backgroundColor: colors.tint },
            isLoading && styles.loginButtonDisabled,
            hovered && { opacity: 0.9, transform: [{ scale: 1.01 }] },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={isDark ? "#000" : "#fff"} />
          ) : (
            <Text
              style={[
                styles.loginButtonText,
                { color: isDark ? "#000" : "#fff" },
              ]}
            >
              {t("auth.login.button")}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={({ hovered }) => [hovered && { opacity: 0.7 }]}
          onPress={() => router.push("/forgot-password")}
        >
          <Text
            style={[styles.linkTextCentered, { color: colors.textSecondary }]}
          >
            <Text style={[styles.linkTextPrimary, { color: colors.tint }]}>
              {t("auth.login.forgot")}
            </Text>
          </Text>
        </Pressable>

        <View style={styles.spacer} />

        <Pressable
          style={({ hovered }) => [hovered && { opacity: 0.7 }]}
          onPress={() => router.replace("/register")}
        >
          <Text
            style={[styles.linkTextCentered, { color: colors.textSecondary }]}
          >
            {t("auth.login.noAccount")}{" "}
            <Text style={[styles.linkTextPrimary, { color: colors.tint }]}>
              {t("auth.login.signUp")}
            </Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#010101", justifyContent: "center" },
  formContainer: {
    paddingHorizontal: 32,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#ffffff",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#888888",
    marginBottom: 32,
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: "#ef4444", fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: "#080808",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: "#ffffff",
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  loginButton: {
    backgroundColor: "#00f2ff",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 24,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: {
    color: "#000000",
    fontWeight: "900",
    fontSize: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  linkTextCentered: {
    color: "#888888",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
  },
  linkTextPrimary: { color: "#00f2ff", fontWeight: "800" },
  spacer: { height: 12 },
});
