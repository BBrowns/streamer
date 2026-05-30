import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { extractErrorMessage } from "../utils/error";
import { useTranslation } from "react-i18next";

import { useTheme } from "../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { AuthScaffold } from "../components/auth/AuthScaffold";
import { BackendUrlField } from "../components/auth/BackendUrlField";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const { resetPassword } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [token, setToken] = useState(tokenParam || "");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    setError("");

    if (!token || !newPassword) {
      setError(t("auth.resetPassword.emptyError"));
      return;
    }

    try {
      setIsLoading(true);
      await resetPassword({ token, newPassword });
      alert(t("auth.resetPassword.successAlert"));
      router.replace("/login");
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage || t("auth.resetPassword.failedError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthScaffold
      title={t("auth.resetPassword.title")}
      subtitle={t("auth.resetPassword.subtitle")}
      image={require("../assets/images/onboarding_security.png")}
      icon="lock-open-outline"
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

        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder={t("auth.resetPassword.tokenPlaceholder")}
          placeholderTextColor={colors.textSecondary + "80"}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
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
          placeholder={t("auth.resetPassword.passwordPlaceholder")}
          placeholderTextColor={colors.textSecondary + "80"}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: colors.tint },
            isLoading && styles.disabledButton,
          ]}
          onPress={handleReset}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#2c1738" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#2c1738" />
              <Text style={styles.primaryButtonText}>
                {t("auth.resetPassword.submit")}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.replace("/login")}
          style={{ marginTop: 12 }}
        >
          <Text style={[styles.linkText, { color: colors.textSecondary }]}>
            <Text style={[styles.linkBold, { color: colors.tint }]}>
              {t("auth.resetPassword.backToLogin")}
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
