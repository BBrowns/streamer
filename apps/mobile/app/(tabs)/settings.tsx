import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Switch,
  Platform,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { api } from "../../services/api";
import { Ionicons } from "@expo/vector-icons";
import { AxiosError } from "axios";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { clearQueryCache } from "../../services/queryPersister";
import { useTrakt } from "../../hooks/useTrakt";
import { useSessions } from "../../hooks/useSessions";
import { ChangePasswordModal } from "../../components/settings/ChangePasswordModal";
import { EditProfileModal } from "../../components/settings/EditProfileModal";
import { ActiveSessionsModal } from "../../components/settings/ActiveSessionsModal";
import { useAccount } from "../../hooks/useAccount";
import {
  hapticSelection,
  hapticWarning,
  hapticSuccess,
} from "../../lib/haptics";

function AdvancedSettingsSection() {
  const { backendUrl, streamServerUrl, setServerUrls } = useAuthStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tempBackend, setTempBackend] = useState(backendUrl || "");
  const [tempStream, setTempStream] = useState(streamServerUrl || "");

  const handleSave = () => {
    setServerUrls(tempBackend.trim() || null, tempStream.trim() || null);
    hapticSuccess();
    Alert.alert("Settings Saved", "Your custom server URLs have been updated.");
  };

  const handleReset = () => {
    setTempBackend("");
    setTempStream("");
    setServerUrls(null, null);
    hapticSelection();
  };

  if (!showAdvanced) {
    return (
      <Pressable
        style={styles.menuItem}
        onPress={() => {
          setShowAdvanced(true);
          hapticSelection();
        }}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: "rgba(245, 158, 11, 0.15)" },
          ]}
        >
          <Ionicons name="options-outline" size={20} color="#f59e0b" />
        </View>
        <View style={styles.menuItemTextContainer}>
          <Text style={styles.menuItemTitle}>Configure Infrastructure</Text>
          <Text style={styles.menuItemSubtitle}>
            Custom backend and stream server URLs
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color="#6b7280" />
      </Pressable>
    );
  }

  return (
    <View style={styles.advancedBox}>
      <View style={styles.advancedHeader}>
        <Text style={styles.advancedTitle}>Infrastructure Overrides</Text>
        <Pressable onPress={() => setShowAdvanced(false)}>
          <Text style={styles.closeAdvanced}>Hide</Text>
        </Pressable>
      </View>

      <Text style={styles.inputLabel}>Backend API URL</Text>
      <TextInput
        style={styles.textInput}
        value={tempBackend}
        onChangeText={setTempBackend}
        placeholder="e.g. http://192.168.1.50:3001"
        placeholderTextColor="#4b5563"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.inputLabel}>Streaming Bridge URL</Text>
      <TextInput
        style={styles.textInput}
        value={tempStream}
        onChangeText={setTempStream}
        placeholder="e.g. http://192.168.1.50:11470"
        placeholderTextColor="#4b5563"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.warningBox}>
        <Ionicons name="warning-outline" size={16} color="#fbbf24" />
        <Text style={styles.warningText}>
          Incorrect values will break the app. Leave empty to use defaults.
        </Text>
      </View>

      <View style={styles.advancedBtns}>
        <Pressable style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetBtnText}>Restore Defaults</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Apply Changes</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SettingsContent() {
  const { user, isAuthenticated } = useAuthStore();
  const logout = useAuthStore((s) => s.logout);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    connected,
    isLoading: isTraktLoading,
    connect,
    disconnect,
  } = useTrakt();

  const {
    sessions,
    isLoading: isSessionsLoading,
    revokeSession,
  } = useSessions();

  const { deleteAccount, exportData } = useAccount();
  const deviceId = useAuthStore((s) => s.deviceId);

  // Active Sessions modal state
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
  // Change Password state
  const [pwModalOpen, setPwModalOpen] = useState(false);
  // Edit Profile state
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Biometrics Support
  const [biometrySupported, setBiometrySupported] = useState(false);
  const [hasCheckedBiometry, setHasCheckedBiometry] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") return;
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        setBiometrySupported(hasHardware && isEnrolled);
      } catch (e) {
        console.warn("LocalAuth check failed", e);
      } finally {
        setHasCheckedBiometry(true);
      }
    })();
  }, []);

  const handleToggleBiometrics = async (value: boolean) => {
    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to enable biometric unlock",
        cancelLabel: "Cancel",
      });
      if (result.success) {
        setBiometricEnabled(true);
      }
    } else {
      setBiometricEnabled(false);
    }
  };

  const handleDeleteAccount = () => {
    hapticWarning();
    Alert.alert(
      "Delete Account",
      "Are you absolutely sure? This action is permanent and will delete all your library items, watch history, and settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: () => {
            Alert.alert("Final Confirmation", "Type 'DELETE' to confirm.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "DELETE",
                style: "destructive",
                onPress: () => deleteAccount.mutate(),
              },
            ]);
          },
        },
      ],
    );
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
            onPress={() => setProfileModalOpen(true)}
            accessibilityRole="button"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.email?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>
                {user?.displayName || user?.email}
              </Text>
              <Text style={styles.menuItemSubtitle}>{user?.email}</Text>
            </View>
            <Ionicons name="pencil" size={16} color="#6b7280" />
          </Pressable>
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          <Pressable
            style={styles.menuItem}
            onPress={() => router.push("/addons")}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="extension-puzzle" size={20} color="#00f2ff" />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>Manage Add-ons</Text>
              <Text style={styles.menuItemSubtitle}>
                Install and remove content sources
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6b7280" />
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
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name="tv-outline"
                size={20}
                color={connected ? "#ed1c24" : "#94a3b8"}
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
              />
            )}
          </Pressable>

          <View style={styles.spacer} />

          <Pressable
            style={styles.menuItem}
            onPress={() => setSessionsModalOpen(true)}
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color="#34d399"
              />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>Active Sessions</Text>
              <Text style={styles.menuItemSubtitle}>
                {isSessionsLoading
                  ? "Loading…"
                  : `${sessions.length} device${sessions.length !== 1 ? "s" : ""} signed in`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6b7280" />
          </Pressable>

          <View style={styles.spacer} />

          <Pressable
            style={styles.menuItem}
            onPress={() => setPwModalOpen(true)}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed" size={20} color="#818cf8" />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>Change Password</Text>
              <Text style={styles.menuItemSubtitle}>
                Update your account password
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6b7280" />
          </Pressable>

          {hasCheckedBiometry && biometrySupported && (
            <>
              <View style={styles.spacer} />
              <View style={styles.menuItem}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: "rgba(168, 85, 247, 0.15)" },
                  ]}
                >
                  <Ionicons
                    name="finger-print-outline"
                    size={20}
                    color="#c084fc"
                  />
                </View>
                <View style={styles.menuItemTextContainer}>
                  <Text style={styles.menuItemTitle}>Biometric Unlock</Text>
                  <Text style={styles.menuItemSubtitle}>
                    Require Face ID / Touch ID to open the app
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleToggleBiometrics}
                  trackColor={{ false: "#374151", true: "#818cf8" }}
                  thumbColor="#fbbf24"
                />
              </View>
            </>
          )}
        </View>

        {/* Privacy & Data */}
        <Text style={styles.sectionHeader}>Privacy & Data</Text>
        <View style={styles.section}>
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              hapticSelection();
              exportData.mutate();
            }}
            disabled={exportData.isPending}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: "rgba(56, 189, 248, 0.15)" },
              ]}
            >
              <Ionicons name="download-outline" size={20} color="#38bdf8" />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>Export My Data</Text>
              <Text style={styles.menuItemSubtitle}>
                Download a copy of your library and settings
              </Text>
            </View>
            {exportData.isPending ? (
              <ActivityIndicator size="small" color="#6b7280" />
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            )}
          </Pressable>

          <View style={styles.spacer} />

          <Pressable
            style={styles.menuItem}
            onPress={handleDeleteAccount}
            disabled={deleteAccount.isPending}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: "rgba(239, 68, 68, 0.15)" },
              ]}
            >
              <Ionicons name="trash-outline" size={20} color="#f87171" />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={styles.menuItemTitle}>Delete Account</Text>
              <Text style={styles.menuItemSubtitle}>
                Permanently remove your account and all data
              </Text>
            </View>
            {deleteAccount.isPending ? (
              <ActivityIndicator size="small" color="#6b7280" />
            ) : (
              <Ionicons name="chevron-forward" size={18} color="#6b7280" />
            )}
          </Pressable>
        </View>

        {/* Advanced Settings */}
        <Text style={styles.sectionHeader}>Advanced</Text>
        <AdvancedSettingsSection />

        {/* Logout */}
        <View style={styles.flexSpacer} />
        <Pressable
          style={styles.logoutButton}
          onPress={() => {
            logout();
            queryClient.clear();
            clearQueryCache();
          }}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </View>

      <ChangePasswordModal
        visible={pwModalOpen}
        onClose={() => setPwModalOpen(false)}
      />

      <EditProfileModal
        visible={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />

      <ActiveSessionsModal
        visible={sessionsModalOpen}
        onClose={() => setSessionsModalOpen(false)}
        sessions={sessions as any}
        isSessionsLoading={isSessionsLoading}
        deviceId={deviceId}
        revokeSession={revokeSession}
      />
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
  sectionHeader: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    marginTop: 8,
  },
  advancedBox: {
    backgroundColor: "#080808",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    marginBottom: 24,
  },
  advancedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  advancedTitle: { color: "#f8fafc", fontWeight: "bold", fontSize: 16 },
  closeAdvanced: { color: "#94a3b8", fontSize: 13 },
  inputLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 8,
    fontWeight: "600",
  },
  textInput: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 16,
    fontSize: 14,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(251, 191, 36, 0.05)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  warningText: { color: "#fbbf24", fontSize: 12, marginLeft: 8, flex: 1 },
  advancedBtns: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  resetBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    alignItems: "center",
  },
  resetBtnText: { color: "#94a3b8", fontWeight: "600", fontSize: 13 },
  saveBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f59e0b",
    alignItems: "center",
  },
  saveBtnText: { color: "#000", fontWeight: "bold", fontSize: 13 },
});
