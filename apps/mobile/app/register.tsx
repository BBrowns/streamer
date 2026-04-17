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

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { register, isLoading, error } = useAuth();
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleRegister = async () => {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const result = await register({
        email: normalizedEmail,
        password,
        displayName: displayName || undefined,
      });

      if (result.verificationRequired) {
        router.push({
          pathname: "/verify-email",
          params: { email: normalizedEmail },
        });
      } else {
        router.replace("/(tabs)");
      }
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
          {t("auth.register.title")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t("auth.register.subtitle")}
        </Text>

        {!!error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{extractErrorMessage(error)}</Text>
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
          placeholder={t("auth.register.name")}
          placeholderTextColor={colors.textSecondary + "80"}
          value={displayName}
          onChangeText={setDisplayName}
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
          placeholder={t("auth.register.email")}
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
          placeholder={t("auth.register.password")}
          placeholderTextColor={colors.textSecondary + "80"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Pressable
          style={({ pressed, hovered }) => [
            styles.registerButton,
            { backgroundColor: colors.tint },
            isLoading && styles.registerButtonDisabled,
            hovered && { opacity: 0.9, transform: [{ scale: 1.01 }] },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={isDark ? "#000" : "#fff"} />
          ) : (
            <Text
              style={[
                styles.registerButtonText,
                { color: isDark ? "#000" : "#fff" },
              ]}
            >
              {t("auth.register.button")}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={({ hovered }) => [hovered && { opacity: 0.7 }]}
          onPress={() => router.replace("/login")}
        >
          <Text
            style={[styles.linkTextCentered, { color: colors.textSecondary }]}
          >
            {t("auth.register.haveAccount")}{" "}
            <Text style={[styles.linkTextPrimary, { color: colors.tint }]}>
              {t("auth.register.signIn")}
            </Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050510", justifyContent: "center" },
  formContainer: {
    paddingHorizontal: 32,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  title: { fontSize: 30, fontWeight: "900", color: "#f8fafc", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#94a3b8", marginBottom: 28 },
  errorContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: "#ef4444", fontSize: 14 },
  input: {
    backgroundColor: "#141423",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#f8fafc",
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.2)",
  },
  registerButton: {
    backgroundColor: "#818cf8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  registerButtonDisabled: { opacity: 0.6 },
  registerButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 16 },
  linkTextCentered: { color: "#94a3b8", textAlign: "center", fontSize: 14 },
  linkTextPrimary: { color: "#818cf8", fontWeight: "bold" },
});
