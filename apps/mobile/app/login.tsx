import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/error";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../hooks/useTheme";
import { AuthScaffold } from "../components/auth/AuthScaffold";
import { BackendUrlField } from "../components/auth/BackendUrlField";

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
          style={({ pressed, hovered }: any) => [
            styles.primaryButton,
            { backgroundColor: colors.tint },
            isLoading && styles.disabledButton,
            hovered && { opacity: 0.9, transform: [{ scale: 1.01 }] },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#2c1738" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={19} color="#2c1738" />
              <Text style={styles.primaryButtonText}>
                {t("auth.login.button")}
              </Text>
            </>
          )}
        </Pressable>

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
  errorText: { color: "#ff9ba6", fontSize: 14, fontWeight: "700", flex: 1 },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
    marginBottom: 24,
  },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: {
    color: "#2c1738",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0,
  },
  linkTextCentered: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
  },
  linkTextPrimary: { fontWeight: "900" },
  spacer: { height: 12 },
});
