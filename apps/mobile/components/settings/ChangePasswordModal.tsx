import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
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
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { getWebFocusStyle } from "../ui/designSystem";

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
  const reducedMotion = useReducedMotion();
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
    <View
      style={[
        inline ? styles.inlineContent : styles.modalBg,
        !inline && { backgroundColor: colors.scrim },
      ]}
    >
      <View
        style={[
          inline ? styles.inlineCard : styles.modalContent,
          !inline && {
            backgroundColor: colors.surfaceOverlay,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleRow}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={colors.tint}
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
              <Text
                style={[styles.modalCancel, { color: colors.textSecondary }]}
              >
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
              borderColor:
                focusedField === "new" ? colors.focus : colors.border,
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
        <Pressable
          style={({ focused, pressed }: any) => [
            styles.modalButton,
            { backgroundColor: colors.tint },
            pwLoading && styles.opacity50,
            pressed && styles.pressed,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={handleChangePassword}
          disabled={pwLoading}
          accessibilityRole="button"
          accessibilityLabel={t("settings.accountModals.password.updateA11y")}
          accessibilityState={{ disabled: pwLoading }}
        >
          {pwLoading ? (
            <ActivityIndicator color={colors.onTint} />
          ) : (
            <Text style={[styles.modalButtonText, { color: colors.onTint }]}>
              {t("settings.accountModals.password.update")}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  if (inline) {
    if (!visible) return null;
    return content;
  }

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? "none" : "slide"}
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 50,
    borderTopWidth: 1,
  },
  keyboardAvoider: { flex: 1 },
  inlineContent: {
    flex: 1,
  },
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
  modalTitle: { fontSize: 20, fontWeight: "900" },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalCancel: { fontWeight: "800", fontSize: 15 },
  headerAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  modalInput: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
  },
  modalButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    minHeight: 52,
  },
  modalButtonText: { fontWeight: "900", fontSize: 16 },
  opacity50: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
