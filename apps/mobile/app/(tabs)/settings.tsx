import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
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
import { Button } from "../../components/ui/Button";
import { Typography } from "../../components/ui/Typography";
import { TextField } from "../../components/ui/TextField";
import { GlassPanel } from "../../components/ui/GlassPanel";
import { Theme } from "../../constants/DesignSystem";

function SettingsContent() {
  const { user, isAuthenticated } = useAuthStore();
  const logout = useAuthStore((s) => s.logout);
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();
  const queryClient = useQueryClient();

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
        <Typography
          variant="body"
          color={Theme.colors.textMuted}
          align="center"
          style={{ marginBottom: 24, maxWidth: 400 }}
        >
          Sign in to manage your account and add-ons
        </Typography>
        <Button
          title="Sign In"
          onPress={() => router.push("/login")}
          size="lg"
          style={styles.signInButton}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* User Info */}
      <View style={styles.section}>
        <Pressable
          onPress={() => {
            if (Platform.OS === "web") {
              router.push("/settings/edit-profile");
            } else {
              setDisplayName(user?.displayName || "");
              setProfileModalOpen(true);
            }
          }}
          accessibilityRole="button"
        >
          <GlassPanel style={styles.menuItem}>
            <View style={styles.avatar}>
              <Typography variant="h2" color={Theme.colors.black}>
                {user?.email?.charAt(0).toUpperCase()}
              </Typography>
            </View>
            <View style={styles.menuItemTextContainer}>
              <Typography variant="h3">
                {user?.displayName || user?.email}
              </Typography>
              <Typography variant="caption" color={Theme.colors.textMuted}>
                {user?.email}
              </Typography>
            </View>
            <Ionicons name="pencil" size={16} color={Theme.colors.textMuted} />
          </GlassPanel>
        </Pressable>
      </View>

      {/* Menu Items */}
      <View style={styles.section}>
        <Pressable
          onPress={() => router.push("/addons")}
          accessibilityRole="button"
        >
          <GlassPanel style={styles.menuItem}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="extension-puzzle"
                size={20}
                color={Theme.colors.primary}
              />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Typography variant="body" weight="700">
                Manage Add-ons
              </Typography>
              <Typography variant="caption" color={Theme.colors.textMuted}>
                Install and remove content sources
              </Typography>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Theme.colors.textMuted}
            />
          </GlassPanel>
        </Pressable>

        <View style={styles.spacer} />

        <Pressable
          onPress={() => {
            if (Platform.OS === "web") {
              router.push("/settings/change-password");
            } else {
              setCurrentPw("");
              setNewPw("");
              setPwModalOpen(true);
            }
          }}
          accessibilityRole="button"
        >
          <GlassPanel style={styles.menuItem}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: "rgba(129, 140, 248, 0.15)" },
              ]}
            >
              <Ionicons name="lock-closed" size={20} color="#818cf8" />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Typography variant="body" weight="700">
                Change Password
              </Typography>
              <Typography variant="caption" color={Theme.colors.textMuted}>
                Update your account password
              </Typography>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Theme.colors.textMuted}
            />
          </GlassPanel>
        </Pressable>
      </View>

      {/* Logout */}
      <View style={styles.logoutContainer}>
        <Button
          title="Sign Out"
          onPress={() => {
            logout();
            queryClient.clear();
            clearQueryCache();
          }}
          variant="danger"
          style={styles.logoutButton}
        />
      </View>

      {/* Change Password Modal */}
      <Modal
        visible={pwModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPwModalOpen(false)}
      >
        <View style={styles.modalBg}>
          <GlassPanel style={styles.modalContent} intensity="high">
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={24}
                  color={Theme.colors.primary}
                  style={styles.modalTitleIcon}
                />
                <Typography variant="h2">Change Password</Typography>
              </View>
              <Pressable onPress={() => setPwModalOpen(false)}>
                <Typography
                  variant="body"
                  color={Theme.colors.textMuted}
                  weight="700"
                >
                  Cancel
                </Typography>
              </Pressable>
            </View>

            <TextField
              label="Current Password"
              placeholder="Enter current password"
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry
              icon="shield-outline"
            />
            <TextField
              label="New Password"
              placeholder="Min 8 characters"
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
              icon="lock-closed-outline"
            />

            <Button
              title="Update Password"
              onPress={handleChangePassword}
              isLoading={pwLoading}
              style={styles.modalButton}
            />
          </GlassPanel>
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
          <GlassPanel style={styles.modalContent} intensity="high">
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Ionicons
                  name="person-outline"
                  size={24}
                  color={Theme.colors.primary}
                  style={styles.modalTitleIcon}
                />
                <Typography variant="h2">Edit Profile</Typography>
              </View>
              <Pressable onPress={() => setProfileModalOpen(false)}>
                <Typography
                  variant="body"
                  color={Theme.colors.textMuted}
                  weight="700"
                >
                  Cancel
                </Typography>
              </Pressable>
            </View>

            <TextField
              label="Display Name"
              placeholder="Name others will see"
              value={displayName}
              onChangeText={setDisplayName}
              icon="person-outline"
            />

            <Button
              title="Save Changes"
              onPress={handleUpdateProfile}
              isLoading={profileLoading}
              style={styles.modalButton}
            />
          </GlassPanel>
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
    backgroundColor: Theme.colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  signInButton: {
    width: "100%",
    maxWidth: 320,
  },
  container: { flex: 1, backgroundColor: Theme.colors.background, padding: 16 },
  section: { marginBottom: 24 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    minHeight: 72,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Theme.shadows.primary,
  },
  menuItemTextContainer: { flex: 1, marginLeft: 16 },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  spacer: { height: 12 },
  logoutContainer: {
    marginTop: 48,
    alignItems: "center",
  },
  logoutButton: {
    width: "100%",
    maxWidth: 280,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    ...Platform.select({
      web: {
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      },
      default: {
        justifyContent: "flex-end",
      },
    }),
  },
  modalContent: {
    ...Platform.select({
      web: {
        borderRadius: 24,
        width: "100%",
        maxWidth: 480,
        overflow: "hidden",
      },
      default: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
      },
    }),
    padding: 24,
    paddingBottom: Platform.OS === "web" ? 32 : 48,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  modalTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalTitleIcon: {
    marginRight: 10,
  },
  modalButton: {
    marginTop: 12,
  },
});
