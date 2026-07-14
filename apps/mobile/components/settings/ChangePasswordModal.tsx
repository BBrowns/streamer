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
import { api } from "../../services/api";
import { AxiosError } from "axios";
import { useTheme } from "../../hooks/useTheme";

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
  const { colors } = useTheme();

  const handleChangePassword = async () => {
    if (!currentPw || newPw.length < 8) {
      Alert.alert("Error", "New password must be at least 8 characters");
      return;
    }
    setPwLoading(true);
    try {
      await api.post("/api/auth/change-password", {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      Alert.alert("Success", "Password changed successfully");
      setCurrentPw("");
      setNewPw("");
      onClose();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError
          ? err.response?.data?.error
          : "Failed to change password";
      Alert.alert(
        "Error",
        (errorMessage as string) || "Failed to change password",
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
              Change Password
            </Text>
          </View>
          {!inline && (
            <Pressable onPress={handleClose}>
              <Text
                style={[styles.modalCancel, { color: colors.textSecondary }]}
              >
                Cancel
              </Text>
            </Pressable>
          )}
        </View>
        <TextInput
          style={[
            styles.modalInput,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="Current password"
          placeholderTextColor={colors.textSecondary}
          value={currentPw}
          onChangeText={setCurrentPw}
          secureTextEntry
          accessibilityLabel="Current password"
          autoComplete="current-password"
        />
        <TextInput
          style={[
            styles.modalInput,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          placeholder="New password (min 8 chars)"
          placeholderTextColor={colors.textSecondary}
          value={newPw}
          onChangeText={setNewPw}
          secureTextEntry
          accessibilityLabel="New password, minimum 8 characters"
          autoComplete="new-password"
        />
        <Pressable
          style={[
            styles.modalButton,
            { backgroundColor: colors.tint },
            pwLoading && styles.opacity50,
          ]}
          onPress={handleChangePassword}
          disabled={pwLoading}
          accessibilityRole="button"
          accessibilityLabel="Update password"
          accessibilityState={{ disabled: pwLoading }}
        >
          {pwLoading ? (
            <ActivityIndicator color={colors.onTint} />
          ) : (
            <Text style={[styles.modalButtonText, { color: colors.onTint }]}>
              Update Password
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
      animationType="slide"
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
});
