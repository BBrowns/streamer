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
import { useTheme } from "../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { AuthScaffold } from "../components/auth/AuthScaffold";
import { BackendUrlField } from "../components/auth/BackendUrlField";

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { register, isLoading, error } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState("");

  const validatePassword = () => {
    if (password.length < 8) return t("auth.register.passwordMin");
    if (!/[A-Z]/.test(password)) return t("auth.register.passwordUpper");
    if (!/[a-z]/.test(password)) return t("auth.register.passwordLower");
    if (!/[0-9]/.test(password)) return t("auth.register.passwordDigit");
    return "";
  };

  const handleRegister = async () => {
    setLocalError("");
    if (!email || !password) {
      setLocalError(t("auth.errors.fillFields"));
      return;
    }

    const passwordError = validatePassword();
    if (passwordError) {
      setLocalError(passwordError);
      return;
    }

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
    <AuthScaffold
      title={t("auth.register.title")}
      subtitle={t("auth.register.subtitle")}
      image={require("../assets/images/onboarding_sync.png")}
      icon="person-add-outline"
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
          style={({ pressed, hovered }: any) => [
            styles.primaryButton,
            { backgroundColor: colors.tint },
            isLoading && styles.disabledButton,
            hovered && { opacity: 0.9, transform: [{ scale: 1.01 }] },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.onTint} />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color={colors.onTint} />
              <Text
                style={[styles.primaryButtonText, { color: colors.onTint }]}
              >
                {t("auth.register.button")}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={({ hovered }: any) => [hovered && { opacity: 0.7 }]}
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
    marginBottom: 20,
  },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: {
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0,
  },
  linkTextCentered: { textAlign: "center", fontSize: 14, fontWeight: "700" },
  linkTextPrimary: { fontWeight: "900" },
});
