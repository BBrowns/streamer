import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authService } from "../services/authService";
import { useAuth } from "../hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useTheme } from "../hooks/useTheme";
import { extractErrorMessage } from "../utils/error";
import { AuthScaffold } from "../components/auth/AuthScaffold";
import { BackendUrlField } from "../components/auth/BackendUrlField";

export default function VerifyEmailScreen() {
  const { email, token: tokenParam } = useLocalSearchParams<{
    email?: string;
    token?: string;
  }>();
  const router = useRouter();
  const { logout } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [token, setToken] = useState(tokenParam || "");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleVerify = async (verificationToken = token) => {
    setError("");
    setMessage("");

    if (!verificationToken.trim()) {
      setError("Verification token is required");
      return;
    }

    try {
      setIsVerifying(true);
      const result = await authService.verifyEmail({
        token: verificationToken.trim(),
      });
      setMessage(result.message || t("auth.verifyEmail.success"));
    } catch (err) {
      setError(extractErrorMessage(err) || t("auth.verifyEmail.failed"));
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (tokenParam) {
      setToken(tokenParam);
      handleVerify(tokenParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenParam]);

  const handleResend = async () => {
    if (!email) return;
    setIsResending(true);
    setError("");
    setMessage("");
    try {
      const result = await authService.resendVerification({ email });
      setMessage(result.message || t("auth.verifyEmail.resendSuccess"));
    } catch (err) {
      setError(extractErrorMessage(err) || t("auth.verifyEmail.resendError"));
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToLogin = () => {
    logout();
    router.replace("/login");
  };

  return (
    <AuthScaffold
      title={t("auth.verifyEmail.title")}
      subtitle={
        email
          ? `${t("auth.verifyEmail.subtitle")} ${email}`
          : t("auth.verifyEmail.description")
      }
      image={require("../assets/images/onboarding_security.png")}
      icon="mail-open-outline"
    >
      <View>
        {message ? (
          <View
            style={[
              styles.messageBox,
              { backgroundColor: colors.success + "18" },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={colors.success}
            />
            <Text style={[styles.messageText, { color: colors.success }]}>
              {message}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={[
              styles.messageBox,
              { backgroundColor: colors.error + "18" },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={[styles.messageText, { color: colors.error }]}>
              {error}
            </Text>
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
          placeholder="Verification token"
          placeholderTextColor={colors.textSecondary + "80"}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: colors.primary },
            isVerifying && styles.disabledButton,
          ]}
          onPress={() => handleVerify()}
          disabled={isVerifying}
        >
          {isVerifying ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={colors.onPrimary}
              />
              <Text
                style={[styles.primaryButtonText, { color: colors.onPrimary }]}
              >
                {t("auth.verifyEmail.verifyButton")}
              </Text>
            </>
          )}
        </Pressable>

        {!!email && (
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: colors.border },
              isResending && styles.disabledButton,
            ]}
            onPress={handleResend}
            disabled={isResending}
          >
            {isResending ? (
              <ActivityIndicator color={colors.tint} />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color={colors.tint} />
                <Text style={[styles.secondaryText, { color: colors.text }]}>
                  {t("auth.verifyEmail.resendButton")}
                </Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable style={styles.backButton} onPress={handleBackToLogin}>
          <Text style={[styles.backText, { color: colors.textSecondary }]}>
            {t("auth.verifyEmail.backToLogin")}
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
    alignItems: "center",
    gap: 10,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
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
    marginTop: 8,
    marginBottom: 12,
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    marginBottom: 12,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "800",
  },
  backButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  backText: {
    fontSize: 15,
    fontWeight: "800",
  },
});
