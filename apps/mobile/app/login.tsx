import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/error";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../hooks/useTheme";
import { AuthScaffold } from "../components/auth/AuthScaffold";
import { BackendUrlField } from "../components/auth/BackendUrlField";
import { TextField } from "../components/ui/TextField";
import { AppButton } from "../components/ui/AppButton";

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { login, isLoading, error } = useAuth();
  const { colors } = useTheme();
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
    <AuthScaffold
      title={t("auth.login.title")}
      subtitle={t("auth.login.subtitle")}
      image={require("../assets/images/onboarding_streaming.png")}
      icon="sparkles"
    >
      <View>
        {!!(error || localError) && (
          <View
            style={[
              styles.messageBox,
              { backgroundColor: colors.error + "18" },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>
              {localError || extractErrorMessage(error)}
            </Text>
          </View>
        )}

        <TextField
          label={t("auth.login.email")}
          containerStyle={styles.field}
          placeholder={t("auth.login.email")}
          placeholderTextColor={colors.textSecondary + "80"}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextField
          label={t("auth.login.password")}
          containerStyle={styles.field}
          placeholder={t("auth.login.password")}
          placeholderTextColor={colors.textSecondary + "80"}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <AppButton
          testID="login-submit"
          label={t("auth.login.button")}
          icon="log-in-outline"
          variant="primary"
          size="large"
          fullWidth
          style={styles.primaryButton}
          onPress={handleLogin}
          disabled={isLoading}
          loading={isLoading}
        />

        <Pressable
          style={({ hovered }: any) => [hovered && { opacity: 0.7 }]}
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
          style={({ hovered }: any) => [hovered && { opacity: 0.7 }]}
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
  errorText: { fontSize: 14, fontWeight: "700", flex: 1 },
  field: { marginBottom: 14 },
  primaryButton: {
    marginTop: 12,
    marginBottom: 24,
  },
  linkTextCentered: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
  },
  linkTextPrimary: { fontWeight: "900" },
  spacer: { height: 12 },
});
