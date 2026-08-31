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
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import { AxiosError } from "axios";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { AppButton } from "../ui/AppButton";
import { getWebFocusStyle, uiRadii } from "../ui/designSystem";
import { AdaptiveOverlay } from "../ui/AdaptiveOverlay";

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
    <View style={inline ? styles.inlineCard : styles.modalContent}>
      <View style={styles.modalHeader}>
        <View style={styles.modalTitleRow}>
          <Ionicons
            name="pencil-outline"
            size={20}
            color={colors.textSecondary}
          />
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
      <AppButton
        label={t("settings.accountModals.profile.save")}
        variant="primary"
        size="large"
        fullWidth
        style={styles.modalButton}
        onPress={handleUpdateProfile}
        disabled={profileLoading}
        loading={profileLoading}
        accessibilityLabel={t("settings.accountModals.profile.saveA11y")}
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
      onClose={onClose}
      accessibilityLabel={t("settings.accountModals.profile.title")}
      testID="edit-profile-overlay"
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
