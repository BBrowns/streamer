import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/authStore";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { useTrakt } from "../../hooks/useTrakt";
import { useSessions } from "../../hooks/useSessions";
import { useAccount } from "../../hooks/useAccount";
import { clearQueryCache } from "../../services/queryPersister";
import type {
  DesktopBridgeInfo,
  DesktopUpdateState,
} from "../../services/desktop-bridge";
import { clientBuildMetadata } from "../../services/buildMetadata";
import { hapticSelection, hapticWarning } from "../../lib/haptics";
import { streamEngineManager } from "../../services/streamEngine/StreamEngineManager";
import { getBridgeStatusPresentation } from "../../services/streamEngine/bridgeStatusPresentation";
import { EmptyState } from "../ui/EmptyState";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { AppButton } from "../ui/AppButton";
import { PageHeader } from "../ui/PageHeader";
import { PageLayout } from "../ui/PageLayout";
import { AppearanceSection } from "./AppearanceSection";
import { LanguageSection } from "./LanguageSection";
import { AdvancedSourcesSection, SourcesSection } from "./SourcesSection";
import { PersonalizationSection } from "./PersonalizationSection";
import { DownloadsSettingsSection } from "./DownloadsSettingsSection";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { EditProfileModal } from "./EditProfileModal";
import { ActiveSessionsModal } from "./ActiveSessionsModal";
import {
  SettingsActionRow,
  SettingsInfoRow,
  SettingsNavRow,
  SettingsRowGroup,
  SettingsToggleRow,
} from "./SettingsRows";
import {
  getSettingsSection,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "./settingsSections";
import { resolveAboutBuildInfo } from "./aboutBuildInfo";

function formatUpdateStatus(
  state: DesktopUpdateState | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!state) return t("settings.update.notLoaded");
  switch (state.status) {
    case "checking":
      return t("settings.update.checking");
    case "available":
      return t("settings.update.available", {
        version: state.latestVersion || t("settings.update.latest"),
      });
    case "current":
      return t("settings.update.current", { version: state.currentVersion });
    case "unsupported":
      return t("settings.update.unsupported");
    case "error":
      return state.error || t("settings.update.failed");
    case "downloaded":
      return t("settings.update.downloaded");
    default:
      return t("settings.update.version", { version: state.currentVersion });
  }
}

function SectionHeading({
  section,
  showTitle,
}: {
  section: SettingsSectionId;
  showTitle: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const definition = getSettingsSection(section);

  if (!showTitle) {
    return (
      <Text
        style={[
          styles.compactSectionDescription,
          { color: colors.textSecondary },
        ]}
      >
        {t(definition.descriptionKey)}
      </Text>
    );
  }

  return (
    <PageHeader
      eyebrow="Streamer"
      title={t(definition.titleKey)}
      description={t(definition.descriptionKey)}
      style={styles.pageHeader}
    />
  );
}

function SettingsOverview({
  onSelect,
}: {
  onSelect: (id: SettingsSectionId) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isCompact } = useWindowClass();
  const user = useAuthStore((state) => state.user);
  const [readiness, setReadiness] = useState(streamEngineManager.bridgeStatus);

  useEffect(() => {
    let active = true;
    streamEngineManager
      .detectBridge()
      .then(() => {
        if (active) setReadiness(streamEngineManager.bridgeStatus);
      })
      .catch(() => {
        if (active) setReadiness(streamEngineManager.bridgeStatus);
      });
    return () => {
      active = false;
    };
  }, []);

  const presentation = getBridgeStatusPresentation(readiness);
  const isReady = presentation.tone === "success";

  return (
    <ScrollView
      testID="settings-overview"
      style={styles.scroll}
      contentContainerStyle={styles.overviewContent}
      showsVerticalScrollIndicator={false}
    >
      {isCompact ? (
        <Text
          style={[
            styles.compactSectionDescription,
            { color: colors.textSecondary },
          ]}
        >
          {t("settings.overview.subtitle")}
        </Text>
      ) : (
        <PageHeader
          title={t("settings.overview.title")}
          description={t("settings.overview.subtitle")}
          style={styles.pageHeader}
        />
      )}

      <View style={[styles.profileSummary, { backgroundColor: colors.card }]}>
        <View
          style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]}
        >
          <Ionicons name="person-outline" size={24} color={colors.text} />
        </View>
        <View style={styles.summaryText}>
          <Text
            style={[styles.summaryTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {user?.displayName || user?.email}
          </Text>
          <Text
            style={[styles.summarySubtitle, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {user?.email}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.readinessSummary,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Ionicons
          name={isReady ? "checkmark-circle-outline" : "alert-circle-outline"}
          size={22}
          color={isReady ? colors.success : colors.warning}
        />
        <View style={styles.summaryText}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {isReady
              ? t("settings.readiness.readyTitle")
              : t("settings.readiness.attentionTitle")}
          </Text>
          <Text
            style={[styles.summarySubtitle, { color: colors.textSecondary }]}
          >
            {isReady
              ? t("settings.readiness.readyDescription")
              : t("settings.readiness.attentionDescription")}
          </Text>
        </View>
        <AppButton
          label={t("settings.readiness.review")}
          variant="ghost"
          size="small"
          onPress={() => onSelect("sources")}
        />
      </View>

      <View style={styles.navigationBlock}>
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
          {t("settings.overview.categories")}
        </Text>
        <SettingsRowGroup>
          {SETTINGS_SECTIONS.map((section) => (
            <SettingsNavRow
              key={section.id}
              section={section}
              title={t(section.titleKey)}
              subtitle={t(section.descriptionKey)}
              onPress={() => onSelect(section.id)}
            />
          ))}
        </SettingsRowGroup>
      </View>
    </ScrollView>
  );
}

type DetailActions = {
  openProfile: () => void;
  openPassword: () => void;
  openSessions: () => void;
  toggleBiometrics: (value: boolean) => Promise<void>;
  handleDeleteAccount: () => void;
  handleSignOut: () => void;
  handleCheckForUpdates: () => Promise<void>;
};

function SettingsDetail({
  section,
  actions,
  account,
  showTitle = true,
}: {
  section: SettingsSectionId;
  actions: DetailActions;
  showTitle?: boolean;
  account: {
    connected: boolean;
    isTraktLoading: boolean;
    connect: () => void;
    disconnect: () => void;
    sessionsCount: number;
    isSessionsLoading: boolean;
    biometricEnabled: boolean;
    biometrySupported: boolean;
    hasCheckedBiometry: boolean;
    exportPending: boolean;
    exportData: () => void;
    deletePending: boolean;
    desktopUpdateState: DesktopUpdateState | null;
    checkingUpdates: boolean;
    canCheckUpdates: boolean;
    desktopBridgeInfo: DesktopBridgeInfo | null;
  };
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const content = (() => {
    switch (section) {
      case "account":
        return (
          <View style={styles.detailStack}>
            <View
              style={[styles.accountHero, { backgroundColor: colors.card }]}
            >
              <View
                style={[
                  styles.largeAvatar,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <Ionicons name="person-outline" size={30} color={colors.text} />
              </View>
              <View style={styles.summaryText}>
                <Text style={[styles.accountName, { color: colors.text }]}>
                  {user?.displayName || user?.email}
                </Text>
                <Text
                  style={[
                    styles.summarySubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  {user?.email}
                </Text>
              </View>
            </View>
            <SettingsRowGroup>
              <SettingsActionRow
                icon="create-outline"
                title={t("settings.detail.account.editProfile")}
                subtitle={t("settings.detail.account.editProfileDescription")}
                onPress={actions.openProfile}
              />
              <SettingsActionRow
                icon="tv-outline"
                title={t("settings.items.trakt")}
                subtitle={
                  account.connected
                    ? t("settings.subtitles.traktConnected")
                    : t("settings.subtitles.traktDisconnected")
                }
                loading={account.isTraktLoading}
                onPress={
                  account.connected ? account.disconnect : account.connect
                }
              />
              <SettingsActionRow
                icon="shield-checkmark-outline"
                title={t("settings.items.activeSessions")}
                subtitle={
                  account.isSessionsLoading
                    ? t("settings.common.loading")
                    : t("settings.subtitles.activeSessions", {
                        count: account.sessionsCount,
                      })
                }
                onPress={actions.openSessions}
              />
              <SettingsActionRow
                icon="lock-closed-outline"
                title={t("settings.items.changePassword")}
                subtitle={t("settings.subtitles.changePassword")}
                onPress={actions.openPassword}
              />
            </SettingsRowGroup>
            <SettingsRowGroup>
              <SettingsActionRow
                icon="log-out-outline"
                title={t("settings.auth.signOut")}
                destructive
                onPress={actions.handleSignOut}
              />
            </SettingsRowGroup>
          </View>
        );
      case "playback":
        return <PersonalizationSection />;
      case "downloads":
        return (
          <View style={styles.detailStack}>
            <DownloadsSettingsSection />
            <SettingsRowGroup>
              <SettingsActionRow
                icon="folder-open-outline"
                title={t("settings.detail.downloads.openDownloads")}
                subtitle={t(
                  "settings.detail.downloads.openDownloadsDescription",
                )}
                onPress={() => router.push("/downloads" as never)}
              />
            </SettingsRowGroup>
          </View>
        );
      case "sources":
        return <SourcesSection showHeader={false} />;
      case "appearance":
        return (
          <View style={styles.detailStack}>
            <View
              style={[styles.controlBlock, { backgroundColor: colors.card }]}
            >
              <Text
                style={[styles.groupLabel, { color: colors.textSecondary }]}
              >
                {t("settings.appearance")}
              </Text>
              <AppearanceSection />
            </View>
            <View
              style={[styles.controlBlock, { backgroundColor: colors.card }]}
            >
              <Text
                style={[styles.groupLabel, { color: colors.textSecondary }]}
              >
                {t("settings.language")}
              </Text>
              <LanguageSection />
            </View>
          </View>
        );
      case "privacy":
        return (
          <View style={styles.detailStack}>
            <SettingsRowGroup>
              {account.hasCheckedBiometry && account.biometrySupported && (
                <SettingsToggleRow
                  icon="finger-print-outline"
                  title={t("settings.items.biometricUnlock")}
                  subtitle={t("settings.subtitles.biometricUnlock")}
                  value={account.biometricEnabled}
                  onValueChange={actions.toggleBiometrics}
                />
              )}
              <SettingsActionRow
                icon="download-outline"
                title={t("settings.items.exportData")}
                subtitle={t("settings.subtitles.exportData")}
                loading={account.exportPending}
                disabled={account.exportPending}
                onPress={account.exportData}
              />
            </SettingsRowGroup>
            <View style={styles.dangerBlock}>
              <Text style={[styles.groupLabel, { color: colors.error }]}>
                {t("settings.detail.privacy.dangerZone")}
              </Text>
              <SettingsRowGroup>
                <SettingsActionRow
                  icon="trash-outline"
                  title={t("settings.items.deleteAccount")}
                  subtitle={t("settings.subtitles.deleteAccount")}
                  destructive
                  loading={account.deletePending}
                  disabled={account.deletePending}
                  onPress={actions.handleDeleteAccount}
                />
              </SettingsRowGroup>
            </View>
          </View>
        );
      case "about": {
        const notAvailable = t("settings.about.notAvailable", {
          defaultValue: "Not available",
        });
        const buildInfo = resolveAboutBuildInfo({
          clientBuild: clientBuildMetadata,
          desktopInfo: account.desktopBridgeInfo,
          updateVersion: account.desktopUpdateState?.currentVersion,
        });

        return (
          <View style={styles.detailStack}>
            <View style={[styles.aboutCard, { backgroundColor: colors.card }]}>
              <Ionicons name="play-circle" size={38} color={colors.text} />
              <View style={styles.summaryText}>
                <Text style={[styles.accountName, { color: colors.text }]}>
                  Streamer
                </Text>
                <Text
                  style={[
                    styles.summarySubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  {t("settings.about.productDescription", {
                    defaultValue: "Movies and series, across your devices.",
                  })}
                </Text>
              </View>
            </View>
            <SettingsRowGroup>
              <SettingsInfoRow
                testID="about-streamer-version"
                title={t("settings.about.streamerApp", {
                  defaultValue: "Streamer app",
                })}
                value={buildInfo.streamerVersion}
              />
              <SettingsInfoRow
                testID="about-desktop-version"
                title={t("settings.about.desktopShell", {
                  defaultValue: "Desktop shell",
                })}
                value={buildInfo.desktopVersion || notAvailable}
              />
              <SettingsInfoRow
                testID="about-electron-version"
                title={t("settings.about.electronRuntime", {
                  defaultValue: "Electron runtime",
                })}
                value={buildInfo.electronVersion || notAvailable}
              />
              <SettingsInfoRow
                testID="about-build-sha"
                title={t("settings.about.buildSha", {
                  defaultValue: "Build SHA",
                })}
                value={buildInfo.buildSha}
              />
              <SettingsInfoRow
                testID="about-build-channel"
                title={t("settings.about.channel", {
                  defaultValue: "Channel",
                })}
                value={buildInfo.channel || notAvailable}
              />
            </SettingsRowGroup>
            <Text style={[styles.bodyCopy, { color: colors.textSecondary }]}>
              {t("settings.about.releasePolicy")}
            </Text>
            <SettingsRowGroup>
              <SettingsActionRow
                icon="document-text-outline"
                title={t("settings.about.terms")}
                subtitle={t("settings.about.termsDescription")}
                onPress={() => router.push("/terms" as never)}
              />
              <SettingsActionRow
                icon="shield-checkmark-outline"
                title={t("settings.about.privacy")}
                subtitle={t("settings.about.privacyDescription")}
                onPress={() => router.push("/privacy" as never)}
              />
            </SettingsRowGroup>
            {account.canCheckUpdates && (
              <SettingsRowGroup>
                <SettingsActionRow
                  icon="refresh-outline"
                  title={t("settings.about.checkUpdates")}
                  subtitle={formatUpdateStatus(account.desktopUpdateState, t)}
                  loading={account.checkingUpdates}
                  disabled={account.checkingUpdates}
                  onPress={actions.handleCheckForUpdates}
                />
              </SettingsRowGroup>
            )}
          </View>
        );
      }
      case "advanced":
        return <AdvancedSourcesSection showHeader={false} />;
    }
  })();

  return (
    <ScrollView
      testID={`settings-detail-${section}`}
      style={styles.scroll}
      contentContainerStyle={styles.detailContent}
      showsVerticalScrollIndicator={false}
    >
      <SectionHeading section={section} showTitle={showTitle} />
      {content}
    </ScrollView>
  );
}

function SettingsExperienceContent({
  section,
}: {
  section?: SettingsSectionId;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isLarge } = useWindowClass();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const biometricEnabled = useAuthStore((state) => state.biometricEnabled);
  const setBiometricEnabled = useAuthStore(
    (state) => state.setBiometricEnabled,
  );
  const deviceId = useAuthStore((state) => state.deviceId);
  const trakt = useTrakt();
  const sessionData = useSessions();
  const account = useAccount();
  const activeSection = section ?? "account";
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
  const [biometrySupported, setBiometrySupported] = useState(false);
  const [hasCheckedBiometry, setHasCheckedBiometry] = useState(false);
  const desktopBridgeApi =
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.desktopBridge
      : undefined;
  const [desktopUpdateState, setDesktopUpdateState] =
    useState<DesktopUpdateState | null>(null);
  const [desktopBridgeInfo, setDesktopBridgeInfo] =
    useState<DesktopBridgeInfo | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") return;
        const [hardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        setBiometrySupported(hardware && enrolled);
      } catch {
        setBiometrySupported(false);
      } finally {
        setHasCheckedBiometry(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!desktopBridgeApi?.getUpdateStatus) return;
    let cancelled = false;
    desktopBridgeApi
      .getUpdateStatus()
      .then((state) => {
        if (!cancelled) setDesktopUpdateState(state);
      })
      .catch(() => null);
    const unsubscribe = desktopBridgeApi.onUpdateStatus?.(
      setDesktopUpdateState,
    );
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [desktopBridgeApi]);

  useEffect(() => {
    if (!desktopBridgeApi?.getBridgeInfo) return;
    let cancelled = false;

    desktopBridgeApi
      .getBridgeInfo()
      .then((info) => {
        if (!cancelled) {
          setDesktopBridgeInfo(info as DesktopBridgeInfo);
        }
      })
      .catch(() => {
        if (!cancelled) setDesktopBridgeInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [desktopBridgeApi]);

  if (!isAuthenticated) {
    return (
      <View
        testID="settings-screen"
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <EmptyState
          size="large"
          icon="settings-outline"
          title={t("settings.overview.title")}
          description={t("settings.auth.manageSettings")}
          actionLabel={t("settings.auth.signIn")}
          onAction={() => router.push("/login")}
        />
      </View>
    );
  }

  const selectSection = (id: SettingsSectionId) => {
    hapticSelection();
    if (isLarge) router.replace(`/settings/${id}` as never);
    else router.push(`/settings/${id}` as never);
  };

  const handleDisconnectTrakt = () => {
    Alert.alert(
      t("settings.alerts.traktDisconnectTitle"),
      t("settings.alerts.traktDisconnectMessage"),
      [
        { text: t("library.header.cancel"), style: "cancel" },
        {
          text: t("settings.alerts.traktDisconnectButton"),
          style: "destructive",
          onPress: () => trakt.disconnect(),
        },
      ],
    );
  };

  const handleToggleBiometrics = async (value: boolean) => {
    if (!value) {
      setBiometricEnabled(false);
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t("settings.biometric.prompt"),
      cancelLabel: t("library.header.cancel"),
    });
    if (result.success) setBiometricEnabled(true);
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
                  text: t("settings.alerts.deleteAccountButton"),
                  style: "destructive",
                  onPress: () => account.deleteAccount.mutate(),
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleCheckForUpdates = async () => {
    if (!desktopBridgeApi?.checkForUpdates) return;
    setCheckingUpdates(true);
    try {
      setDesktopUpdateState(await desktopBridgeApi.checkForUpdates());
    } finally {
      setCheckingUpdates(false);
    }
  };

  const detailProps = {
    section: activeSection,
    actions: {
      openProfile: () => setProfileModalOpen(true),
      openPassword: () => setPwModalOpen(true),
      openSessions: () => setSessionsModalOpen(true),
      toggleBiometrics: handleToggleBiometrics,
      handleDeleteAccount,
      handleSignOut: () => {
        logout();
        queryClient.clear();
        void clearQueryCache();
      },
      handleCheckForUpdates,
    },
    account: {
      connected: trakt.connected,
      isTraktLoading: trakt.isLoading,
      connect: trakt.connect,
      disconnect: handleDisconnectTrakt,
      sessionsCount: sessionData.sessions.length,
      isSessionsLoading: sessionData.isLoading,
      biometricEnabled,
      biometrySupported,
      hasCheckedBiometry,
      exportPending: account.exportData.isPending,
      exportData: () => account.exportData.mutate(),
      deletePending: account.deleteAccount.isPending,
      desktopUpdateState,
      checkingUpdates,
      canCheckUpdates: !!desktopBridgeApi?.getUpdateStatus,
      desktopBridgeInfo,
    },
  };

  return (
    <PageLayout
      testID="settings-screen"
      contained={false}
      style={styles.screen}
    >
      {isLarge ? (
        <View style={styles.largeLayout}>
          <View
            style={[
              styles.largeNavigation,
              { borderRightColor: colors.border },
            ]}
          >
            <View style={styles.largeNavigationHeading}>
              <Text style={[styles.navTitle, { color: colors.text }]}>
                {t("settings.overview.title")}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.navAccount, { color: colors.textSecondary }]}
              >
                {user?.displayName || user?.email}
              </Text>
            </View>
            <ScrollView contentContainerStyle={styles.largeNavigationList}>
              {SETTINGS_SECTIONS.map((definition) => (
                <SettingsNavRow
                  key={definition.id}
                  section={definition}
                  title={t(definition.titleKey)}
                  selected={definition.id === activeSection}
                  compact
                  onPress={() => selectSection(definition.id)}
                />
              ))}
            </ScrollView>
          </View>
          <View style={styles.largeDetail}>
            <SettingsDetail {...detailProps} showTitle />
          </View>
        </View>
      ) : section ? (
        <SettingsDetail {...detailProps} showTitle={false} />
      ) : (
        <SettingsOverview onSelect={selectSection} />
      )}

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
        sessions={sessionData.sessions as never}
        isSessionsLoading={sessionData.isLoading}
        deviceId={deviceId}
        revokeSession={sessionData.revokeSession}
      />
    </PageLayout>
  );
}

export function SettingsExperience({
  section,
}: {
  section?: SettingsSectionId;
}) {
  return (
    <ErrorBoundary>
      <SettingsExperienceContent section={section} />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  overviewContent: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 56,
    gap: 20,
  },
  pageHeader: { marginBottom: 0 },
  compactSectionDescription: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 640,
  },
  profileSummary: {
    minHeight: 80,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  largeAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryText: { flex: 1, gap: 3 },
  summaryTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  summarySubtitle: { fontSize: 13, lineHeight: 18 },
  readinessSummary: {
    minHeight: 76,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navigationBlock: { gap: 9 },
  groupLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  largeLayout: {
    flex: 1,
    flexDirection: "row",
    alignSelf: "center",
    width: "100%",
    maxWidth: 1180,
  },
  largeNavigation: {
    width: 256,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 36,
    paddingHorizontal: 12,
  },
  largeNavigationHeading: { paddingHorizontal: 12, gap: 4, marginBottom: 20 },
  navTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  navAccount: { fontSize: 13, lineHeight: 18 },
  largeNavigationList: { gap: 4, paddingBottom: 32 },
  largeDetail: { flex: 1 },
  detailContent: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 64,
    gap: 28,
  },
  detailStack: { gap: 20 },
  accountHero: {
    minHeight: 96,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  accountName: { fontSize: 20, lineHeight: 26, fontWeight: "800" },
  controlBlock: { borderRadius: 12, padding: 18, gap: 12 },
  dangerBlock: { gap: 9, marginTop: 8 },
  aboutCard: {
    minHeight: 92,
    borderRadius: 12,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  bodyCopy: { fontSize: 14, lineHeight: 21, maxWidth: 620 },
});
