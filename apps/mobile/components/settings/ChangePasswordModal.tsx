import {
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import { AxiosError } from "axios";
import { useTheme } from "../../hooks/useTheme";
import { AppButton } from "../ui/AppButton";
import { getWebFocusStyle, uiRadii } from "../ui/designSystem";
import { AdaptiveOverlay } from "../ui/AdaptiveOverlay";

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  inline?: boolean;
}

export function ChangePasswordModal({
  visible,
  onClose,
  inline,
}: ChangePasswordModalProps) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"current" | "new" | null>(
    null,
  );
  const { colors } = useTheme();
  const { t } = useTranslation();

  const handleChangePassword = async () => {
    if (!currentPw || newPw.length < 8) {
      Alert.alert(
        t("settings.accountModals.common.errorTitle"),
        t("settings.accountModals.password.minimumLength"),
      );
      return;
    }
    setPwLoading(true);
    try {
      await api.post("/api/auth/change-password", {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      Alert.alert(
        t("settings.accountModals.common.successTitle"),
        t("settings.accountModals.password.updated"),
      );
      setCurrentPw("");
      setNewPw("");
      onClose();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError
          ? err.response?.data?.error
          : t("settings.accountModals.password.updateFailed");
      Alert.alert(
        t("settings.accountModals.common.errorTitle"),
        (errorMessage as string) ||
          t("settings.accountModals.password.updateFailed"),
      );
    } finally {
      setPwLoading(false);
    }
  };

  const handleClose = () => {
    setCurrentPw("");
    setNewPw("");
    onClose();
  };

  const content = (
    <View style={inline ? styles.inlineCard : styles.modalContent}>
      <View style={styles.modalHeader}>
        <View style={styles.modalTitleRow}>
          <Ionicons
            name="lock-closed-outline"
            size={20}
            color={colors.textSecondary}
          />
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {t("settings.accountModals.password.title")}
          </Text>
        </View>
        {!inline && (
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel={t("settings.accountModals.common.cancel")}
            style={({ focused, pressed }: any) => [
              styles.headerAction,
              pressed && styles.pressed,
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
            ]}
          >
            <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>
              {t("settings.accountModals.common.cancel")}
            </Text>
          </Pressable>
        )}
      </View>
      <TextInput
        style={[
          styles.modalInput,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor:
              focusedField === "current" ? colors.focus : colors.border,
            color: colors.text,
          },
        ]}
        placeholder={t("settings.accountModals.password.current")}
        placeholderTextColor={colors.textSecondary}
        value={currentPw}
        onChangeText={setCurrentPw}
        onFocus={() => setFocusedField("current")}
        onBlur={() => setFocusedField(null)}
        secureTextEntry
        accessibilityLabel={t("settings.accountModals.password.current")}
        autoComplete="current-password"
      />
      <TextInput
        style={[
          styles.modalInput,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: focusedField === "new" ? colors.focus : colors.border,
            color: colors.text,
          },
        ]}
        placeholder={t("settings.accountModals.password.new")}
        placeholderTextColor={colors.textSecondary}
        value={newPw}
        onChangeText={setNewPw}
        onFocus={() => setFocusedField("new")}
        onBlur={() => setFocusedField(null)}
        secureTextEntry
        accessibilityLabel={t("settings.accountModals.password.newA11y")}
        autoComplete="new-password"
      />
      <AppButton
        label={t("settings.accountModals.password.update")}
        variant="primary"
        size="large"
        fullWidth
        style={styles.modalButton}
        onPress={handleChangePassword}
        disabled={pwLoading}
        loading={pwLoading}
        accessibilityLabel={t("settings.accountModals.password.updateA11y")}
      />
    </View>
  );

  if (inline) {
    if (!visible) return null;
    return content;
  }

  return (
    <AdaptiveOverlay
      visible={visible}
      onClose={handleClose}
      accessibilityLabel={t("settings.accountModals.password.title")}
      testID="change-password-overlay"
      size="form"
      placement="center"
    >
      <KeyboardAvoidingView
        style={styles.overlayContent}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    padding: 24,
    width: "100%",
  },
  overlayContent: { width: "100%" },
  inlineCard: {
    backgroundColor: "transparent",
    padding: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: { fontSize: 20, lineHeight: 26, fontWeight: "600" },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalCancel: { fontWeight: "600", fontSize: 15 },
  headerAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  modalInput: {
    borderRadius: uiRadii.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
  },
  modalButton: {
    marginTop: 12,
  },
  pressed: { opacity: 0.72 },
});
