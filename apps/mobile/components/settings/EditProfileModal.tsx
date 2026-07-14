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
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import { AxiosError } from "axios";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { getWebFocusStyle } from "../ui/designSystem";

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  inline?: boolean;
}

export function EditProfileModal({
  visible,
  onClose,
  inline,
}: EditProfileModalProps) {
  const { user, setAuth } = useAuthStore();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileLoading, setProfileLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    if (visible) {
      setDisplayName(user?.displayName || "");
    }
  }, [visible, user]);

  const handleUpdateProfile = async () => {
    setProfileLoading(true);
    try {
      const { data } = await api.patch("/api/auth/profile", {
        displayName: displayName || undefined,
      });
      // Update local state
      if (user) {
        setAuth(
          { ...user, displayName: data.user.displayName },
          useAuthStore.getState().accessToken!,
          useAuthStore.getState().refreshToken!,
        );
      }
      Alert.alert(
        t("settings.accountModals.common.successTitle"),
        t("settings.accountModals.profile.updated"),
      );
      onClose();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError
          ? err.response?.data?.error
          : t("settings.accountModals.profile.updateFailed");
      Alert.alert(
        t("settings.accountModals.common.errorTitle"),
        (errorMessage as string) ||
          t("settings.accountModals.profile.updateFailed"),
      );
    } finally {
      setProfileLoading(false);
    }
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
            <Ionicons name="pencil-outline" size={20} color={colors.tint} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t("settings.accountModals.profile.title")}
            </Text>
          </View>
          {!inline && (
            <Pressable
              onPress={onClose}
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
              borderColor: inputFocused ? colors.focus : colors.border,
              color: colors.text,
            },
          ]}
          placeholder={t("settings.accountModals.profile.displayName")}
          placeholderTextColor={colors.textSecondary}
          value={displayName}
          onChangeText={setDisplayName}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          accessibilityLabel={t("settings.accountModals.profile.displayName")}
          autoComplete="name"
        />
        <Pressable
          style={({ focused, pressed }: any) => [
            styles.modalButton,
            { backgroundColor: colors.tint },
            profileLoading && styles.opacity50,
            pressed && styles.pressed,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={handleUpdateProfile}
          disabled={profileLoading}
          accessibilityRole="button"
          accessibilityLabel={t("settings.accountModals.profile.saveA11y")}
          accessibilityState={{ disabled: profileLoading }}
        >
          {profileLoading ? (
            <ActivityIndicator color={colors.onTint} />
          ) : (
            <Text style={[styles.modalButtonText, { color: colors.onTint }]}>
              {t("settings.accountModals.profile.save")}
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
      onRequestClose={onClose}
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
