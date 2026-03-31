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
import { useSessions } from "../../hooks/useSessions";
import { ChangePasswordModal } from "../../components/settings/ChangePasswordModal";
import { EditProfileModal } from "../../components/settings/EditProfileModal";
import { ActiveSessionsModal } from "../../components/settings/ActiveSessionsModal";

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
  const {
    sessions,
    isLoading: isSessionsLoading,
    revokeSession,
  } = useSessions();
  const deviceId = useAuthStore((s) => s.deviceId);

  // Active Sessions modal state
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);

  // Change Password state
  const [pwModalOpen, setPwModalOpen] = useState(false);

  // Edit Profile state
  const [profileModalOpen, setProfileModalOpen] = useState(false);

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
            onPress={() => setSessionsModalOpen(true)}
            testID="btn-settings-sessions"
            accessibilityRole="button"
            accessibilityLabel="View active sessions"
            accessibilityHint="Manage devices currently signed into your account"
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color="#34d399"
                accessibilityElementsHidden
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
            onPress={() => setPwModalOpen(true)}
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
});
