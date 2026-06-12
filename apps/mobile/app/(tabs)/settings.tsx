import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ScrollView,
  useWindowDimensions,
  Switch,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { clearQueryCache } from "../../services/queryPersister";
import { useTrakt } from "../../hooks/useTrakt";
import { useSessions } from "../../hooks/useSessions";
import { ChangePasswordModal } from "../../components/settings/ChangePasswordModal";
import { EditProfileModal } from "../../components/settings/EditProfileModal";
import { ActiveSessionsModal } from "../../components/settings/ActiveSessionsModal";
import { useAccount } from "../../hooks/useAccount";
import { hapticSelection, hapticWarning } from "../../lib/haptics";
import type { DesktopUpdateState } from "../../services/desktop-bridge";

// Modular components
import { SettingsSection } from "../../components/settings/SettingsSection";
import { AppearanceSection } from "../../components/settings/AppearanceSection";
import { LanguageSection } from "../../components/settings/LanguageSection";
import { SourcesSection } from "../../components/settings/SourcesSection";

function formatDesktopUpdateStatus(state: DesktopUpdateState | null) {
  if (!state) return "Update status is not loaded yet.";

  switch (state.status) {
    case "checking":
      return "Checking for updates...";
    case "available":
      return `Version ${state.latestVersion || "latest"} is available.`;
    case "current":
      return `Streamer is up to date (${state.currentVersion}).`;
    case "unsupported":
      return "Update checks are available in packaged desktop builds.";
    case "error":
      return state.error || "Update check failed.";
    case "downloaded":
      return "An update was downloaded by the desktop updater.";
    default:
      return `Current version: ${state.currentVersion}`;
  }
}

function SettingsContent() {
  const { user, isAuthenticated } = useAuthStore();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
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

  // Desktop specific state
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const desktopBridgeApi =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.desktopBridge
      : undefined;
  const [activePane, setActivePane] = useState<
    "sources" | "profile" | "password" | "sessions" | null
  >("sources");
  const [desktopUpdateState, setDesktopUpdateState] =
    useState<DesktopUpdateState | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

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

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof window === "undefined" ||
      !desktopBridgeApi?.getUpdateStatus
    ) {
      return;
    }

    let cancelled = false;
    desktopBridgeApi
      .getUpdateStatus()
      .then((state) => {
        if (!cancelled) setDesktopUpdateState(state);
      })
      .catch(() => null);

    const unsubscribe = desktopBridgeApi.onUpdateStatus?.((state) => {
      setDesktopUpdateState(state);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [desktopBridgeApi]);

  const handleCheckForDesktopUpdates = async () => {
    if (!desktopBridgeApi?.checkForUpdates) return;
    hapticSelection();
    setCheckingUpdates(true);
    try {
      setDesktopUpdateState(await desktopBridgeApi.checkForUpdates());
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleOpenDesktopUpdatePage = async () => {
    if (!desktopBridgeApi?.openUpdatePage) return;
    hapticSelection();
    setDesktopUpdateState(await desktopBridgeApi.openUpdatePage());
  };

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
      t("settings.alerts.deleteAccountTitle"),
      t("settings.alerts.deleteAccountMessage"),
      [
        { text: t("library.header.cancel"), style: "cancel" },
        {
          text: t("settings.alerts.deleteAccountButton"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t("settings.alerts.deleteAccountConfirmTitle"),
              t("settings.alerts.deleteAccountConfirmMessage"),
              [
                { text: t("library.header.cancel"), style: "cancel" },
                {
                  text: "DELETE",
                  style: "destructive",
                  onPress: () => deleteAccount.mutate(),
                },
              ],
            );
          },
        },
      ],
    );
  };

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState
          size="large"
          icon="settings-outline"
          title={t("settings.auth.title", { defaultValue: "Settings" })}
          description={t("settings.auth.manageSettings")}
          actionLabel={t("settings.auth.signIn")}
          onAction={() => router.push("/login")}
        />
      </View>
    );
  }

  const handleProfilePress = () => {
    if (isDesktop) setActivePane("profile");
    else setProfileModalOpen(true);
  };

  const handleSessionsPress = () => {
    if (isDesktop) setActivePane("sessions");
    else setSessionsModalOpen(true);
  };

  const handlePasswordPress = () => {
    if (isDesktop) setActivePane("password");
    else setPwModalOpen(true);
  };

  const renderModals = () => (
    <>
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
    </>
  );

  const renderDesktopPane = () => {
    if (activePane === "sources") {
      return (
        <View style={styles.desktopRightPaneContent}>
          <SourcesSection />
        </View>
      );
    }

    if (activePane === "password") {
      return (
        <View style={styles.desktopRightPaneContent}>
          <ChangePasswordModal
            visible
            onClose={() => setActivePane("sources")}
            inline
          />
        </View>
      );
    }

    if (activePane === "profile") {
      return (
        <View style={styles.desktopRightPaneContent}>
          <EditProfileModal
            visible
            onClose={() => setActivePane("sources")}
            inline
          />
        </View>
      );
    }

    if (activePane === "sessions") {
      return (
        <View style={styles.desktopRightPaneContent}>
          <ActiveSessionsModal
            visible
            onClose={() => setActivePane("sources")}
            sessions={sessions as any}
            isSessionsLoading={isSessionsLoading}
            deviceId={deviceId}
            revokeSession={revokeSession}
            inline
          />
        </View>
      );
    }

    return (
      <View style={styles.desktopPlaceholder}>
        <Ionicons
          name="settings-outline"
          size={48}
          color={colors.textSecondary}
          style={{ opacity: 0.3 }}
        />
        <Text
          style={[
            styles.desktopPlaceholderText,
            { color: colors.textSecondary },
          ]}
        >
          {t("settings.desktopPlaceholder", "Select a setting to view details")}
        </Text>
      </View>
    );
  };

  const MasterList = (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: colors.background, flex: 1 },
      ]}
      contentContainerStyle={[styles.contentWrapper, { paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Sources & add-ons */}
      <SettingsSection
        title={t("settings.sections.sourcesAddons", {
          defaultValue: "Sources & Add-ons",
        })}
      >
        {isDesktop ? (
          <Pressable
            style={styles.menuItem}
            onPress={() => setActivePane("sources")}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: "rgba(129,140,248,0.15)" },
              ]}
            >
              <Ionicons name="play-circle-outline" size={20} color="#818cf8" />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={[styles.menuItemTitle, { color: colors.text }]}>
                {t("settings.items.playbackReadiness", {
                  defaultValue: "Playback readiness",
                })}
              </Text>
              <Text
                style={[
                  styles.menuItemSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                {t("settings.subtitles.playbackReadiness", {
                  defaultValue:
                    "Check bridge, cast, downloads, and stream readiness",
                })}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : (
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              hapticSelection();
              router.push("/sources" as any);
            }}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: "rgba(245, 158, 11, 0.14)" },
              ]}
            >
              <Ionicons name="radio-outline" size={20} color="#f3b96b" />
            </View>
            <View style={styles.menuItemTextContainer}>
              <Text style={[styles.menuItemTitle, { color: colors.text }]}>
                {t("settings.items.playbackReadiness", {
                  defaultValue: "Playback readiness",
                })}
              </Text>
              <Text
                style={[
                  styles.menuItemSubtitle,
                  { color: colors.textSecondary },
                ]}
              >
                {t("settings.subtitles.playbackReadiness", {
                  defaultValue:
                    "Check bridge, cast, downloads, and stream readiness",
                })}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.menuItem}
          onPress={() => {
            hapticSelection();
            router.push("/addons");
          }}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(216,180,254,0.14)" },
            ]}
          >
            <Ionicons
              name="extension-puzzle-outline"
              size={20}
              color="#d8b4fe"
            />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {t("settings.items.manageAddons")}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {t("settings.subtitles.manageAddons")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      </SettingsSection>

      {/* Playback & Downloads */}
      <SettingsSection
        title={t("settings.sections.playbackDownloads", {
          defaultValue: "Playback & Downloads",
        })}
      >
        <Pressable
          style={[
            styles.menuItem,
            isDesktop && activePane === "sources" && styles.menuItemActive,
          ]}
          onPress={() => {
            hapticSelection();
            if (isDesktop) setActivePane("sources");
            else router.push("/sources" as any);
          }}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(245, 158, 11, 0.14)" },
            ]}
          >
            <Ionicons name="radio-outline" size={20} color="#f3b96b" />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {t("settings.items.desktopBridgeCast", {
                defaultValue: "Desktop bridge & cast",
              })}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {t("settings.subtitles.desktopBridgeCast", {
                defaultValue:
                  "LAN URL, cast readiness, torrent engine, and repair actions",
              })}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.menuItem}
          onPress={() => {
            hapticSelection();
            router.push("/downloads");
          }}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(56, 189, 248, 0.12)" },
            ]}
          >
            <Ionicons name="cloud-download-outline" size={20} color="#38bdf8" />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {t("tabs.downloads")}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {t("settings.subtitles.downloads", {
                defaultValue:
                  "Queue, offline files, verification, and storage state",
              })}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      </SettingsSection>

      {/* Account & Sync */}
      <SettingsSection
        title={t("settings.sections.account", {
          defaultValue: "Account & Sync",
        })}
      >
        <Pressable
          style={[
            styles.menuItem,
            isDesktop && activePane === "profile" && styles.menuItemActive,
          ]}
          onPress={handleProfilePress}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(129,140,248,0.15)" },
            ]}
          >
            <Ionicons name="person-outline" size={20} color="#818cf8" />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {user?.displayName || user?.email}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {user?.email}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.menuItem}
          onPress={
            connected
              ? () => {
                  Alert.alert(
                    t("settings.alerts.traktDisconnectTitle"),
                    t("settings.alerts.traktDisconnectMessage"),
                    [
                      { text: t("library.header.cancel"), style: "cancel" },
                      {
                        text: t("settings.alerts.traktDisconnectButton"),
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
          <View
            style={[
              styles.iconContainer,
              {
                backgroundColor: connected
                  ? "rgba(237, 28, 36, 0.1)"
                  : "rgba(255,255,255,0.05)",
              },
            ]}
          >
            <Ionicons
              name="tv-outline"
              size={20}
              color={connected ? "#ed1c24" : colors.textSecondary}
            />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {t("settings.items.trakt")}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {connected
                ? t("settings.subtitles.traktConnected")
                : t("settings.subtitles.traktDisconnected")}
            </Text>
          </View>
          {isTraktLoading ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Ionicons
              name={connected ? "checkmark-circle" : "chevron-forward"}
              size={18}
              color={connected ? "#10b981" : colors.textSecondary}
            />
          )}
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable
          style={[
            styles.menuItem,
            isDesktop && activePane === "sessions" && styles.menuItemActive,
          ]}
          onPress={handleSessionsPress}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(52, 211, 153, 0.1)" },
            ]}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color="#34d399"
            />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {t("settings.items.activeSessions")}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {isSessionsLoading
                ? "Loading…"
                : t("settings.subtitles.activeSessions", {
                    count: sessions.length,
                  })}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable
          style={[
            styles.menuItem,
            isDesktop && activePane === "password" && styles.menuItemActive,
          ]}
          onPress={handlePasswordPress}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(129, 140, 248, 0.1)" },
            ]}
          >
            <Ionicons name="lock-closed" size={20} color="#818cf8" />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {t("settings.items.changePassword")}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {t("settings.subtitles.changePassword")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
      </SettingsSection>

      {/* Application */}
      <SettingsSection
        title={t("settings.sections.application", {
          defaultValue: "Application",
        })}
      >
        <View style={{ padding: 16 }}>
          <Text style={[styles.innerLabel, { color: colors.textSecondary }]}>
            {t("settings.appearance")}
          </Text>
          <AppearanceSection />

          <View
            style={[
              styles.divider,
              {
                backgroundColor: colors.border,
                marginLeft: 0,
                marginVertical: 16,
              },
            ]}
          />

          <Text style={[styles.innerLabel, { color: colors.textSecondary }]}>
            {t("settings.language")}
          </Text>
          <LanguageSection />

          {desktopBridgeApi?.getUpdateStatus && (
            <>
              <View
                style={[
                  styles.divider,
                  {
                    backgroundColor: colors.border,
                    marginLeft: 0,
                    marginVertical: 16,
                  },
                ]}
              />

              <Text
                style={[styles.innerLabel, { color: colors.textSecondary }]}
              >
                Desktop updates
              </Text>
              <View
                style={[
                  styles.updateCard,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(124,58,237,0.06)",
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: "rgba(124, 58, 237, 0.14)" },
                  ]}
                >
                  <Ionicons
                    name={
                      desktopUpdateState?.status === "available"
                        ? "arrow-up-circle-outline"
                        : "sparkles-outline"
                    }
                    size={20}
                    color="#a78bfa"
                  />
                </View>
                <View style={styles.updateContent}>
                  <Text style={[styles.menuItemTitle, { color: colors.text }]}>
                    Manual updates
                  </Text>
                  <Text
                    style={[
                      styles.menuItemSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {formatDesktopUpdateStatus(desktopUpdateState)}
                  </Text>
                  {desktopUpdateState?.releaseName ? (
                    <Text
                      style={[
                        styles.menuItemSubtitle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {desktopUpdateState.releaseName}
                    </Text>
                  ) : null}
                  <View style={styles.updateActions}>
                    <Pressable
                      style={[
                        styles.updateButton,
                        { borderColor: colors.border },
                        checkingUpdates && styles.opacity50,
                      ]}
                      onPress={handleCheckForDesktopUpdates}
                      disabled={checkingUpdates}
                    >
                      {checkingUpdates ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.textSecondary}
                        />
                      ) : (
                        <Ionicons
                          name="refresh-outline"
                          size={16}
                          color={colors.text}
                        />
                      )}
                      <Text
                        style={[
                          styles.updateButtonText,
                          { color: colors.text },
                        ]}
                      >
                        Check
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.updateButton,
                        { borderColor: colors.border },
                      ]}
                      onPress={handleOpenDesktopUpdatePage}
                    >
                      <Ionicons
                        name="open-outline"
                        size={16}
                        color={colors.text}
                      />
                      <Text
                        style={[
                          styles.updateButtonText,
                          { color: colors.text },
                        ]}
                      >
                        Releases
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>

        {hasCheckedBiometry && biometrySupported && (
          <>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
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
                <Text style={[styles.menuItemTitle, { color: colors.text }]}>
                  {t("settings.items.biometricUnlock")}
                </Text>
                <Text
                  style={[
                    styles.menuItemSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("settings.subtitles.biometricUnlock")}
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometrics}
                trackColor={{
                  false: isDark ? "#374151" : "#e2e8f0",
                  true: colors.tint,
                }}
                thumbColor={biometricEnabled ? "#fff" : "#f1f5f9"}
              />
            </View>
          </>
        )}
      </SettingsSection>

      {/* Privacy & Danger Zone */}
      <SettingsSection title={t("settings.sections.privacy")}>
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
              { backgroundColor: "rgba(56, 189, 248, 0.1)" },
            ]}
          >
            <Ionicons name="download-outline" size={20} color="#38bdf8" />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {t("settings.items.exportData")}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {t("settings.subtitles.exportData")}
            </Text>
          </View>
          {exportData.isPending ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          )}
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.menuItem}
          onPress={handleDeleteAccount}
          disabled={deleteAccount.isPending}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(239, 68, 68, 0.1)" },
            ]}
          >
            <Ionicons name="trash-outline" size={20} color="#f87171" />
          </View>
          <View style={styles.menuItemTextContainer}>
            <Text style={[styles.menuItemTitle, { color: colors.text }]}>
              {t("settings.items.deleteAccount")}
            </Text>
            <Text
              style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
            >
              {t("settings.subtitles.deleteAccount")}
            </Text>
          </View>
          {deleteAccount.isPending ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          )}
        </Pressable>
      </SettingsSection>

      {/* Logout */}
      <Pressable
        style={styles.logoutButton}
        onPress={() => {
          logout();
          queryClient.clear();
          clearQueryCache();
        }}
      >
        <Text style={styles.logoutText}>{t("settings.auth.signOut")}</Text>
      </Pressable>

      {!isDesktop && renderModals()}
    </ScrollView>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopContainer}>
        <View style={styles.desktopLeftPane}>{MasterList}</View>
        <View
          style={[
            styles.desktopRightPane,
            {
              backgroundColor: colors.background,
              borderLeftColor: colors.border,
            },
          ]}
        >
          {renderDesktopPane()}
        </View>
      </View>
    );
  }

  return MasterList;
}

export default function SettingsScreen() {
  return (
    <ErrorBoundary>
      <SettingsContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  contentWrapper: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  desktopContainer: {
    flex: 1,
    flexDirection: "row",
  },
  desktopLeftPane: {
    width: 400,
    maxWidth: "40%",
    height: "100%",
  },
  desktopRightPane: {
    flex: 1,
    height: "100%",
    borderLeftWidth: 1,
  },
  desktopRightPaneContent: {
    flex: 1,
    padding: 24,
    maxWidth: 760,
    width: "100%",
  },
  desktopPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  desktopPlaceholderText: {
    fontSize: 16,
    fontWeight: "500",
    opacity: 0.8,
  },
  section: { marginBottom: 24 },
  sectionGroup: { marginBottom: 28 },
  sectionGroupTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 8,
  },
  sectionGroupContent: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionGroupPlain: {},
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    minHeight: 64,
  },
  menuItemActive: {
    backgroundColor: "rgba(216,180,254,0.14)",
  },
  divider: {
    height: 1,
    marginLeft: 56, // Align with text
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#6366f1",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#ffffff", fontSize: 24, fontWeight: "900" },
  menuItemTextContainer: { flex: 1, marginLeft: 12 },
  menuItemTitle: { fontWeight: "bold", fontSize: 16 },
  menuItemSubtitle: { fontSize: 12, marginTop: 2 },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  innerLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    opacity: 0.8,
  },
  spacer: { height: 8 },
  flexSpacer: { flex: 1 },
  logoutButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 56,
    marginBottom: 20,
  },
  logoutText: {
    color: "#ef4444",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    marginTop: 8,
  },
  advancedBox: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    marginBottom: 24,
  },
  advancedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  advancedTitle: { fontWeight: "bold", fontSize: 16 },
  advancedSubtitle: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  manageAddonsCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(216,180,254,0.08)",
    padding: 14,
    marginBottom: 14,
  },
  bridgeInfoCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 18,
    gap: 8,
  },
  optionalServiceCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(242,215,255,0.08)",
    marginBottom: 20,
    gap: 8,
  },
  bridgeInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bridgeStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  bridgeInfoTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  bridgeInfoText: {
    fontSize: 12,
    lineHeight: 17,
  },
  updateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  updateContent: {
    flex: 1,
    gap: 4,
  },
  updateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  updateButton: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  updateButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  opacity50: {
    opacity: 0.5,
  },
  bridgeUrlText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  bridgeDiagnosticsBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  bridgeDiagnosticsText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  inlineActionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  inlineAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  inlineActionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  inputLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 8,
    fontWeight: "600",
  },
  textInput: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
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
  appearanceGrid: {
    flexDirection: "row",
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  appearanceBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 4,
  },
  appearanceText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
