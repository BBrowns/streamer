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
  ScrollView,
  useWindowDimensions,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { api } from "../../services/api";
import { Ionicons } from "@expo/vector-icons";
import { AxiosError } from "axios";
import { EmptyState } from "../../components/ui/EmptyState";
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
import { SegmentedControl } from "../../components/ui/SegmentedControl";

function SectionGroup({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: any;
}) {
  return (
    <View style={styles.sectionGroup}>
      <Text style={[styles.sectionGroupTitle, { color: colors.textSecondary }]}>
        {title.toUpperCase()}
      </Text>
      <View
        style={[
          styles.sectionGroupContent,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function AdvancedSettingsSection() {
  const { t } = useTranslation();
  const { backendUrl, streamServerUrl, setServerUrls } = useAuthStore();
  const { colors, isDark } = useTheme();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tempBackend, setTempBackend] = useState(backendUrl || "");
  const [tempStream, setTempStream] = useState(streamServerUrl || "");

  const handleSave = () => {
    setServerUrls(tempBackend.trim() || null, tempStream.trim() || null);
    hapticSuccess();
    Alert.alert(
      t("settings.advanced.successTitle"),
      t("settings.advanced.successMessage"),
    );
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
        style={[
          styles.menuItem,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
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
          <Text style={[styles.menuItemTitle, { color: colors.text }]}>
            {t("settings.advanced.configure")}
          </Text>
          <Text
            style={[styles.menuItemSubtitle, { color: colors.textSecondary }]}
          >
            {t("settings.advanced.subtitle")}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color="#6b7280" />
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.advancedBox,
        {
          backgroundColor: colors.card,
          borderColor: isDark
            ? "rgba(245, 158, 11, 0.2)"
            : "rgba(245, 158, 11, 0.4)",
        },
      ]}
    >
      <View style={styles.advancedHeader}>
        <Text style={[styles.advancedTitle, { color: colors.text }]}>
          {t("settings.advanced.title")}
        </Text>
        <Pressable onPress={() => setShowAdvanced(false)}>
          <Text style={[styles.closeAdvanced, { color: colors.textSecondary }]}>
            {t("settings.advanced.hide")}
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
        {t("settings.advanced.backendLabel")}
      </Text>
      <TextInput
        style={[
          styles.textInput,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={tempBackend}
        onChangeText={setTempBackend}
        placeholder="e.g. http://192.168.1.50:3001"
        placeholderTextColor={colors.textSecondary + "80"}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
        {t("settings.advanced.streamLabel")}
      </Text>
      <TextInput
        style={[
          styles.textInput,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.05)",
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={tempStream}
        onChangeText={setTempStream}
        placeholder="e.g. http://192.168.1.50:11470"
        placeholderTextColor={colors.textSecondary + "80"}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.warningBox}>
        <Ionicons name="warning-outline" size={16} color="#fbbf24" />
        <Text style={styles.warningText}>{t("settings.advanced.warning")}</Text>
      </View>

      <View style={styles.advancedBtns}>
        <Pressable
          style={[styles.resetBtn, { borderColor: colors.border }]}
          onPress={handleReset}
        >
          <Text style={[styles.resetBtnText, { color: colors.textSecondary }]}>
            {t("settings.advanced.restore")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.tint }]}
          onPress={handleSave}
        >
          <Text
            style={[styles.saveBtnText, { color: isDark ? "#000" : "#fff" }]}
          >
            {t("settings.advanced.apply")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useAuthStore();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const options = [
    {
      label: t("settings.theme.light"),
      value: "light" as const,
      icon: "sunny-outline",
    },
    {
      label: t("settings.theme.dark"),
      value: "dark" as const,
      icon: "moon-outline",
    },
    {
      label: t("settings.theme.system"),
      value: "system" as const,
      icon: "contrast-outline",
    },
  ];

  return (
    <View style={styles.section}>
      <SegmentedControl
        options={options}
        value={theme}
        onChange={setTheme}
        renderIcon={(name, active) => (
          <Ionicons
            name={name as any}
            size={20}
            color={active ? colors.tint : colors.textSecondary}
          />
        )}
      />
    </View>
  );
}

function LanguageSection() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  const languages = [
    { label: "English", value: "en", emoji: "🇺🇸" },
    { label: "Español", value: "es", emoji: "🇪🇸" },
    { label: "Nederlands", value: "nl", emoji: "🇳🇱" },
  ];

  const handleLanguageChange = async (lang: string) => {
    await i18n.changeLanguage(lang);
    await AsyncStorage.setItem("user-language", lang);
  };

  return (
    <View style={styles.section}>
      <SegmentedControl
        options={languages}
        value={currentLang}
        onChange={handleLanguageChange}
      />
    </View>
  );
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
  const [activePane, setActivePane] = useState<
    "profile" | "password" | "sessions" | null
  >(null);

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
        visible={isDesktop ? activePane === "password" : pwModalOpen}
        onClose={() =>
          isDesktop ? setActivePane(null) : setPwModalOpen(false)
        }
        inline={isDesktop}
      />
      <EditProfileModal
        visible={isDesktop ? activePane === "profile" : profileModalOpen}
        onClose={() =>
          isDesktop ? setActivePane(null) : setProfileModalOpen(false)
        }
        inline={isDesktop}
      />
      <ActiveSessionsModal
        visible={isDesktop ? activePane === "sessions" : sessionsModalOpen}
        onClose={() =>
          isDesktop ? setActivePane(null) : setSessionsModalOpen(false)
        }
        sessions={sessions as any}
        isSessionsLoading={isSessionsLoading}
        deviceId={deviceId}
        revokeSession={revokeSession}
        inline={isDesktop}
      />
    </>
  );

  const MasterList = (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: colors.background, flex: 1 },
      ]}
      contentContainerStyle={[styles.contentWrapper, { paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile */}
      <SectionGroup
        title={t("settings.sections.account", { defaultValue: "Account" })}
        colors={colors}
      >
        <Pressable
          style={[
            styles.menuItem,
            isDesktop &&
              activePane === "profile" && {
                backgroundColor: "rgba(255,255,255,0.05)",
              },
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
      </SectionGroup>

      {/* Appearance */}
      <SectionGroup title={t("settings.appearance")} colors={colors}>
        <View style={{ padding: 16 }}>
          <AppearanceSection />
        </View>
      </SectionGroup>

      {/* Language */}
      <SectionGroup title={t("settings.language")} colors={colors}>
        <View style={{ padding: 16, paddingTop: 4 }}>
          <LanguageSection />
        </View>
      </SectionGroup>

      {/* Integrations */}
      <SectionGroup
        title={t("settings.sections.integrations", {
          defaultValue: "Integrations",
        })}
        colors={colors}
      >
        <Pressable
          style={styles.menuItem}
          onPress={() => router.push("/addons")}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(0,242,255,0.1)" },
            ]}
          >
            <Ionicons
              name="extension-puzzle-outline"
              size={20}
              color="#00f2ff"
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
      </SectionGroup>

      {/* Security */}
      <SectionGroup
        title={t("settings.sections.security", { defaultValue: "Security" })}
        colors={colors}
      >
        <Pressable
          style={[
            styles.menuItem,
            isDesktop &&
              activePane === "sessions" && {
                backgroundColor: "rgba(255,255,255,0.05)",
              },
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
            isDesktop &&
              activePane === "password" && {
                backgroundColor: "rgba(255,255,255,0.05)",
              },
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
      </SectionGroup>

      {/* Privacy */}
      <SectionGroup title={t("settings.sections.privacy")} colors={colors}>
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
      </SectionGroup>

      {/* Advanced */}
      <SectionGroup title={t("settings.sections.advanced")} colors={colors}>
        <AdvancedSettingsSection />
      </SectionGroup>

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
            { backgroundColor: colors.card, borderLeftColor: colors.border },
          ]}
        >
          {activePane ? (
            <View style={styles.desktopRightPaneContent}>{renderModals()}</View>
          ) : (
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
                {t(
                  "settings.desktopPlaceholder",
                  "Select a setting to view details",
                )}
              </Text>
            </View>
          )}
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
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    minHeight: 64,
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
  closeAdvanced: { color: "#94a3b8", fontSize: 13 },
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
