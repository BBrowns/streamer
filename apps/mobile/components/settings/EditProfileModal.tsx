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
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../services/api";
import { AxiosError } from "axios";
import { useAuthStore } from "../../stores/authStore";

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export function EditProfileModal({ visible, onClose }: EditProfileModalProps) {
  const { user, setAuth } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileLoading, setProfileLoading] = useState(false);

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
      Alert.alert("Success", "Profile updated");
      onClose();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError
          ? err.response?.data?.error
          : "Failed to update profile";
      Alert.alert(
        "Error",
        (errorMessage as string) || "Failed to update profile",
      );
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBg}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Ionicons name="pencil-outline" size={20} color="#00f2ff" />
              <Text style={styles.modalTitle}>Edit Profile</Text>
            </View>
            <Pressable onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.modalInput}
            placeholder="Display name"
            placeholderTextColor="#6b7280"
            value={displayName}
            onChangeText={setDisplayName}
            accessibilityLabel="Display name"
            autoComplete="name"
          />
          <Pressable
            style={[styles.modalButton, profileLoading && styles.opacity50]}
            onPress={handleUpdateProfile}
            disabled={profileLoading}
            accessibilityRole="button"
            accessibilityLabel="Save profile changes"
            accessibilityState={{ disabled: profileLoading }}
          >
            {profileLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalButtonText}>Save</Text>
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
