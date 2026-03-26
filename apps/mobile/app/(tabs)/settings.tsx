import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { api } from "../../services/api";
import { Ionicons } from "@expo/vector-icons";
import { AxiosError } from "axios";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { clearQueryCache } from "../../services/queryPersister";
import { useTrakt } from "../../hooks/useTrakt";

function SettingsContent() {
  const { user, isAuthenticated } = useAuthStore();
  const logout = useAuthStore((s) => s.logout);
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    connected,
    isLoading: isTraktLoading,
    connect,
    disconnect,
  } = useTrakt();

  // Change Password state
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  // Edit Profile state
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [profileLoading, setProfileLoading] = useState(false);

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
      setPwModalOpen(false);
      setCurrentPw("");
      setNewPw("");
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
      setProfileModalOpen(false);
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

  if (!isAuthenticated) {
    return (
      <View style={styles.unauthContainer}>
        <Text style={styles.unauthText} accessibilityRole="text">
          Sign in to manage settings
        </Text>
        <Pressable
          style={styles.signInButton}
          onPress={() => router.push("/login")}
          accessibilityRole="button"
          accessibilityLabel="Sign in to your account"
        >
          <Text style={styles.signInText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.contentWrapper}>
        {/* User Info */}
        <View style={styles.section}>
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              setDisplayName(user?.displayName || "");
              setProfileModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Edit profile for ${user?.displayName || user?.email}`}
            accessibilityHint="Opens profile editor"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText} accessibilityElementsHidden>
                {user?.email?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>
                {user?.displayName || user?.email}
              </Text>
              <Text style={styles.menuItemSubtitle}>{user?.email}</Text>
            </View>
            <Ionicons
              name="pencil"
              size={16}
              color="#6b7280"
              accessibilityElementsHidden
            />
          </Pressable>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          <Pressable
            style={styles.menuItem}
            onPress={() => router.push("/addons")}
            accessibilityRole="button"
            accessibilityLabel="Manage add-ons"
            accessibilityHint="Install and remove content sources"
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name="extension-puzzle"
                size={20}
                color="#00f2ff"
                accessibilityElementsHidden
              />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>Manage Add-ons</Text>
              <Text style={styles.menuItemSubtitle}>
                Install and remove content sources
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color="#6b7280"
              accessibilityElementsHidden
            />
          </Pressable>

          <View style={styles.spacer} />

          <Pressable
            style={styles.menuItem}
            onPress={
              connected
                ? () => {
                    Alert.alert(
                      "Disconnect Trakt",
                      "Are you sure you want to unlink your Trakt.tv account?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Disconnect",
                          style: "destructive",
                          onPress: () => disconnect(),
                        },
                      ],
                    );
                  }
                : connect
            }
            disabled={isTraktLoading}
            accessibilityRole="button"
            accessibilityLabel={
              connected ? "Disconnect Trakt.tv" : "Connect Trakt.tv"
            }
            accessibilityHint={
              connected ? "Unlinks your account" : "Opens Trakt.tv login"
            }
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name="tv-outline"
                size={20}
                color={connected ? "#ed1c24" : "#94a3b8"}
                accessibilityElementsHidden
              />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>Trakt.tv</Text>
              <Text style={styles.menuItemSubtitle}>
                {connected ? "Connected" : "Sync watch history across devices"}
              </Text>
            </View>
            {isTraktLoading ? (
              <ActivityIndicator size="small" color="#6b7280" />
            ) : (
              <Ionicons
                name={connected ? "checkmark-circle" : "chevron-forward"}
                size={18}
                color={connected ? "#10b981" : "#6b7280"}
                accessibilityElementsHidden
              />
            )}
          </Pressable>

          <View style={styles.spacer} />

          <Pressable
            style={styles.menuItem}
            onPress={() => {
              setCurrentPw("");
              setNewPw("");
              setPwModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Change password"
            accessibilityHint="Opens password change form"
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name="lock-closed"
                size={20}
                color="#818cf8"
                accessibilityElementsHidden
              />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>Change Password</Text>
              <Text style={styles.menuItemSubtitle}>
                Update your account password
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color="#6b7280"
              accessibilityElementsHidden
            />
          </Pressable>
        </View>

        {/* Logout */}
        <View style={styles.flexSpacer} />
        <Pressable
          style={styles.logoutButton}
          onPress={() => {
            logout();
            queryClient.clear();
            clearQueryCache();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          accessibilityHint="Logs you out and clears cached data"
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </View>

      {/* Change Password Modal */}
      <Modal
        visible={pwModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPwModalOpen(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#818cf8"
                />
                <Text style={styles.modalTitle}>Change Password</Text>
              </View>
              <Pressable onPress={() => setPwModalOpen(false)}>
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

      {/* Edit Profile Modal */}
      <Modal
        visible={profileModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setProfileModalOpen(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="pencil-outline" size={20} color="#00f2ff" />
                <Text style={styles.modalTitle}>Edit Profile</Text>
              </View>
              <Pressable onPress={() => setProfileModalOpen(false)}>
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
    </View>
  );
}

export default function SettingsScreen() {
  return (
    <ErrorBoundary>
      <SettingsContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  unauthContainer: {
    flex: 1,
    backgroundColor: "#050510",
    justifyContent: "center",
    alignItems: "center",
  },
  unauthText: { color: "#94a3b8", marginBottom: 16 },
  signInButton: {
    backgroundColor: "#818cf8",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  signInText: { color: "#ffffff", fontWeight: "bold" },
  container: { flex: 1, backgroundColor: "#050510", padding: 16 },
  contentWrapper: {
    flex: 1,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  section: { marginBottom: 24 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#080808",
    borderRadius: 16,
    padding: 16,
    minHeight: 64,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#00f2ff",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#000000", fontSize: 24, fontWeight: "900" },
  menuItemTextContainer: { flex: 1, marginLeft: 12 },
  menuItemTitle: { color: "#f8fafc", fontWeight: "bold", fontSize: 16 },
  menuItemSubtitle: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(129, 140, 248, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  spacer: { height: 8 },
  flexSpacer: { flex: 1 },
  logoutButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 48,
  },
  logoutText: { color: "#ef4444", fontWeight: "600" },
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
