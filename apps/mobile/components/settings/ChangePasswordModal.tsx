import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../services/api";
import { AxiosError } from "axios";

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({
  visible,
  onClose,
}: ChangePasswordModalProps) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.modalBg}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Ionicons name="lock-closed-outline" size={20} color="#818cf8" />
              <Text style={styles.modalTitle}>Change Password</Text>
            </View>
            <Pressable onPress={handleClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.modalInput}
            placeholder="Current password"
            placeholderTextColor="#6b7280"
            value={currentPw}
            onChangeText={setCurrentPw}
            secureTextEntry
            accessibilityLabel="Current password"
            autoComplete="current-password"
          />
          <TextInput
            style={styles.modalInput}
            placeholder="New password (min 8 chars)"
            placeholderTextColor="#6b7280"
            value={newPw}
            onChangeText={setNewPw}
            secureTextEntry
            accessibilityLabel="New password, minimum 8 characters"
            autoComplete="new-password"
          />
          <Pressable
            style={[styles.modalButton, pwLoading && styles.opacity50]}
            onPress={handleChangePassword}
            disabled={pwLoading}
            accessibilityRole="button"
            accessibilityLabel="Update password"
            accessibilityState={{ disabled: pwLoading }}
          >
            {pwLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalButtonText}>Update Password</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#0d0d0d",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 50,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "900" },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalCancel: { color: "#888888", fontWeight: "800", fontSize: 15 },
  modalInput: {
    backgroundColor: "#121212",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#ffffff",
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalButton: {
    backgroundColor: "#00f2ff",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    minHeight: 52,
  },
  modalButtonText: { color: "#000000", fontWeight: "900", fontSize: 16 },
  opacity50: { opacity: 0.5 },
});
