import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { BridgeDiagnostics } from "../../services/streamEngine/StreamEngineManager";
import { usePlaybackEnvironmentStatus } from "../../hooks/usePlaybackEnvironmentStatus";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { hapticSelection } from "../../lib/haptics";
import {
  clientBuildMetadata,
  formatBuildLabel,
} from "../../services/buildMetadata";
import { AppButton } from "../ui/AppButton";
import { getWebFocusStyle } from "../ui/designSystem";
import { StatusPill } from "../ui/StatusPill";
import { Surface } from "../ui/Surface";
import { TextField } from "../ui/TextField";
import { SettingsActionRow, SettingsRowGroup } from "./SettingsRows";

type CapabilityTone = "success" | "warning" | "error" | "neutral" | "info";

function SettingsSubheading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.subheading}>
      <Text style={[styles.subheadingTitle, { color: colors.text }]}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={[styles.subheadingCopy, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function CapabilityRow({
  icon,
  title,
  subtitle,
  status,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  status: string;
  tone: CapabilityTone;
}) {
  const { colors } = useTheme();
  const { isCompact } = useWindowClass();

  return (
    <View style={styles.capabilityRow}>
      <View style={styles.capabilityIcon}>
        <Ionicons name={icon} size={21} color={colors.textSecondary} />
      </View>
      <View style={styles.capabilityText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowCopy, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
        {isCompact && (
          <View style={styles.compactStatus}>
            <StatusPill label={status} tone={tone} />
          </View>
        )}
      </View>
      {!isCompact && <StatusPill label={status} tone={tone} />}
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

export function SourcesSection({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const environment = usePlaybackEnvironmentStatus();
  const readinessTone: CapabilityTone = environment.bridgeReady
    ? "success"
    : environment.bridgeNeedsRepair
      ? "error"
      : "warning";

  return (
    <View testID="sources-consumer-section" style={styles.container}>
      {showHeader && (
        <SettingsSubheading
          title={t("settings.navigation.sources.title", {
            defaultValue: "Sources & Devices",
          })}
          subtitle={t("settings.sourcesSection.pageDescription")}
        />
      )}

      <Surface
        variant={
          environment.bridgeReady
            ? "accent"
            : environment.bridgeNeedsRepair
              ? "warning"
              : "default"
        }
        style={styles.readinessCard}
      >
        <StatusPill
          label={
            environment.bridgeReady
              ? t("settings.readiness.readyTitle", {
                  defaultValue: "Ready to play",
                })
              : t("settings.readiness.attentionTitle", {
                  defaultValue: "Needs attention",
                })
          }
          tone={readinessTone}
          icon={
            environment.bridgeReady
              ? "checkmark-circle-outline"
              : "alert-circle-outline"
          }
        />
        <Text style={[styles.readinessTitle, { color: colors.text }]}>
          {environment.bridgeReady
            ? t("settings.readiness.readyTitle")
            : t("settings.readiness.attentionTitle")}
        </Text>
        <Text style={[styles.readinessCopy, { color: colors.textSecondary }]}>
          {environment.bridgeReady
            ? t("settings.readiness.readyDescription")
            : t("settings.readiness.attentionDescription")}
        </Text>
        <View style={styles.actions}>
          <AppButton
            label={t("settings.readiness.checkAgain", {
              defaultValue: "Check again",
            })}
            icon="refresh-outline"
            variant="ghost"
            size="small"
            loading={environment.isChecking}
            disabled={environment.isChecking}
            onPress={() => void environment.refreshEnvironment()}
          />
        </View>
      </Surface>

      <SettingsSubheading
        title={t("settings.sourcesSection.contentAddonsTitle", {
          defaultValue: "Content Add-ons",
        })}
        subtitle={t("settings.sourcesSection.addonsDescription", {
          defaultValue:
            "Install and manage the add-ons that provide your catalog.",
        })}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("settings.items.manageAddons")}
        onPress={() => {
          hapticSelection();
          router.push("/addons");
        }}
        style={({ pressed, focused }: any) => [
          styles.focusable,
          pressed && styles.pressed,
          Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
        ]}
      >
        <Surface style={styles.navigationCard}>
          <Ionicons
            name="extension-puzzle-outline"
            size={22}
            color={colors.textSecondary}
          />
          <View style={styles.capabilityText}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              {t("settings.items.manageAddons")}
            </Text>
            <Text style={[styles.rowCopy, { color: colors.textSecondary }]}>
              {t("settings.subtitles.manageAddons")}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </Surface>
      </Pressable>

      <SettingsSubheading
        title={t("settings.sourcesSection.playbackDevicesTitle", {
          defaultValue: "Playback & devices",
        })}
        subtitle={t("settings.sourcesSection.playbackDevicesDescription", {
          defaultValue:
            "See whether this device can prepare local playback and casting.",
        })}
      />
      <Surface style={styles.capabilityCard}>
        <CapabilityRow
          icon="desktop-outline"
          title={t("settings.sourcesSection.localPlaybackService", {
            defaultValue: "Local Playback Service",
          })}
          subtitle={
            environment.bridgeReady
              ? t("settings.sourcesSection.localPlaybackReady", {
                  defaultValue:
                    "Local playback and offline preparation are available.",
                })
              : t("settings.sourcesSection.localPlaybackLimited", {
                  defaultValue:
                    "Some source types may need a desktop setup check.",
                })
          }
          status={
            environment.bridgeReady
              ? t("settings.advancedSection.ready")
              : t("settings.advancedSection.limited")
          }
          tone={environment.bridgeReady ? "success" : "warning"}
        />
        <Divider />
        <CapabilityRow
          icon="radio-outline"
          title={t("settings.sourcesSection.castingDevices", {
            defaultValue: "Casting & Devices",
          })}
          subtitle={
            environment.castPreflight.ready
              ? t("settings.advancedSection.castingReadyDescription")
              : t("settings.sourcesSection.castingLimited", {
                  defaultValue:
                    "Casting is available for compatible sources and devices.",
                })
          }
          status={
            environment.castPreflight.ready
              ? t("settings.advancedSection.ready")
              : t("settings.advancedSection.limited")
          }
          tone={environment.castPreflight.ready ? "success" : "warning"}
        />
      </Surface>
    </View>
  );
}

export function AdvancedSourcesSection({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const environment = usePlaybackEnvironmentStatus();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const diagnostics = environment.effectiveDiagnostics;
  const repair = environment.repair;

  return (
    <View testID="sources-advanced-section" style={styles.container}>
      {showHeader && (
        <SettingsSubheading
          title={t("settings.navigation.advanced.title", {
            defaultValue: "Advanced",
          })}
          subtitle={t("settings.navigation.advanced.description")}
        />
      )}

      <SettingsSubheading
        title={t("settings.advancedSection.connectionSettings", {
          defaultValue: "Server & pairing",
        })}
        subtitle={t("settings.advancedSection.connectionDescription")}
      />
      <Surface style={styles.formCard}>
        <TextField
          label={t("settings.advanced.backendLabel", {
            defaultValue: "Backend API URL",
          })}
          value={environment.backendInput}
          onChangeText={environment.setBackendInput}
          placeholder="e.g. http://192.168.1.50:3001"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label={t("settings.advanced.streamLabel", {
            defaultValue: "Streaming Service URL",
          })}
          value={environment.streamInput}
          onChangeText={environment.setStreamInput}
          placeholder="e.g. http://192.168.1.50:11470"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label={t("settings.advancedSection.pairingToken", {
            defaultValue: "Pairing token",
          })}
          value={environment.pairingTokenInput}
          onChangeText={environment.setPairingTokenInput}
          placeholder={t("settings.advancedSection.pairingPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        {environment.bridgeUrlNeedsLan && (
          <Surface variant="warning" style={styles.inlineNotice}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <View style={styles.capabilityText}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                {t("settings.advancedSection.lanWarningTitle", {
                  defaultValue: "Use the desktop service LAN address",
                })}
              </Text>
              <Text style={[styles.rowCopy, { color: colors.textSecondary }]}>
                {t("settings.advancedSection.lanWarningDescription")}
              </Text>
            </View>
          </Surface>
        )}
        {!!environment.bridgeInfo?.lanUrl && (
          <AppButton
            label={t("settings.advancedSection.useLanUrl")}
            icon="link-outline"
            size="small"
            variant="ghost"
            onPress={() => {
              environment.setStreamInput(environment.bridgeInfo!.lanUrl);
              if (environment.bridgeInfo?.pairingToken) {
                environment.setPairingTokenInput(
                  environment.bridgeInfo.pairingToken,
                );
              }
            }}
          />
        )}
        <Surface variant="warning" style={styles.inlineNotice}>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <Text style={[styles.noticeCopy, { color: colors.textSecondary }]}>
            {t("settings.advanced.warning")}
          </Text>
        </Surface>
        <View style={styles.footer}>
          <AppButton
            label={t("settings.advanced.restore")}
            onPress={environment.resetConnections}
            variant="secondary"
            size="large"
            fullWidth
          />
          <AppButton
            label={t("settings.advanced.apply")}
            onPress={() => void environment.saveConnections()}
            variant="primary"
            size="large"
            fullWidth
          />
        </View>
      </Surface>

      <SettingsSubheading
        title={t("settings.advancedSection.serviceMaintenance", {
          defaultValue: "Playback service maintenance",
        })}
        subtitle={t("settings.advancedSection.serviceMaintenanceDescription", {
          defaultValue:
            "Re-check, repair, clean cached files or export diagnostics.",
        })}
      />
      <SettingsRowGroup>
        <SettingsActionRow
          icon="pulse-outline"
          title={t("settings.advancedSection.recheckRuntime", {
            defaultValue: "Re-check runtime",
          })}
          subtitle={environment.presentation.detail}
          loading={environment.isChecking}
          disabled={environment.isChecking}
          onPress={() => void environment.refreshEnvironment()}
        />
        {environment.canRestart && (
          <SettingsActionRow
            icon="reload-outline"
            title={t("settings.advancedSection.restart", {
              defaultValue: "Restart playback service",
            })}
            subtitle={t("settings.advancedSection.restartDescription", {
              defaultValue: "Restart the local desktop playback process.",
            })}
            loading={environment.isRestarting}
            disabled={environment.isRestarting}
            onPress={() => void environment.restartService()}
          />
        )}
        {!!repair?.required && (
          <SettingsActionRow
            icon="build-outline"
            title={t("settings.advancedSection.repairSteps", {
              defaultValue: "Repair steps",
            })}
            subtitle={repair.detail || environment.presentation.detail}
            onPress={environment.showRepairSteps}
          />
        )}
        {!!environment.torrentCacheLabel && (
          <SettingsActionRow
            icon="trash-outline"
            title={t("settings.advancedSection.cleanPlaybackCache", {
              defaultValue: "Clean playback cache",
            })}
            subtitle={environment.torrentCacheLabel}
            loading={environment.isCleaningCache}
            disabled={environment.isCleaningCache}
            onPress={() => void environment.cleanCache()}
          />
        )}
        <SettingsActionRow
          icon="document-text-outline"
          title={t("settings.advancedSection.exportDiagnostics", {
            defaultValue: "Export diagnostics",
          })}
          subtitle={t("settings.advancedSection.diagnosticsDescription")}
          loading={environment.isExportingDiagnostics}
          disabled={environment.isExportingDiagnostics}
          onPress={() => void environment.exportDiagnostics()}
        />
      </SettingsRowGroup>

      <SettingsSubheading
        title={t("settings.advancedSection.technicalDetails", {
          defaultValue: "Technical details",
        })}
        subtitle={t("settings.advancedSection.technicalDescription")}
      />
      <Surface style={styles.disclosureCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showTechnicalDetails }}
          accessibilityLabel={t("settings.advancedSection.technicalDetails", {
            defaultValue: "Technical details",
          })}
          onPress={() => setShowTechnicalDetails((visible) => !visible)}
          style={({ pressed, focused }: any) => [
            styles.disclosureRow,
            pressed && styles.pressed,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
        >
          <View style={styles.capabilityText}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              {t("settings.advancedSection.runtimeBuildDetails", {
                defaultValue: "Runtime and build details",
              })}
            </Text>
            <Text style={[styles.rowCopy, { color: colors.textSecondary }]}>
              {showTechnicalDetails
                ? t("settings.advancedSection.hideTechnical", {
                    defaultValue: "Hide internal status and version details.",
                  })
                : t("settings.advancedSection.showTechnical", {
                    defaultValue: "Show internal status and version details.",
                  })}
            </Text>
          </View>
          <Ionicons
            name={showTechnicalDetails ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textSecondary}
          />
        </Pressable>
        {showTechnicalDetails && (
          <View
            style={[styles.technicalContent, { borderTopColor: colors.border }]}
          >
            <TechnicalDetails diagnostics={diagnostics} />
          </View>
        )}
      </Surface>
    </View>
  );
}

function TechnicalDetails({ diagnostics }: { diagnostics: BridgeDiagnostics }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const entries: Array<[string, string | null | undefined]> = [
    [
      t("settings.advancedSection.appBuildLabel", {
        defaultValue: "App build",
      }),
      formatBuildLabel(clientBuildMetadata),
    ],
    [
      t("settings.advancedSection.statusLabel", { defaultValue: "Status" }),
      diagnostics.status,
    ],
    [
      t("settings.advancedSection.reasonLabel", { defaultValue: "Reason" }),
      diagnostics.reason?.replace(/-/g, " "),
    ],
    [
      t("settings.advancedSection.messageLabel", { defaultValue: "Message" }),
      diagnostics.message,
    ],
    [
      t("settings.advancedSection.runtimeLabel", { defaultValue: "Runtime" }),
      diagnostics.platform && diagnostics.processArch
        ? `${diagnostics.platform}/${diagnostics.processArch}`
        : null,
    ],
    [
      t("settings.advancedSection.nativeRuntimeLabel", {
        defaultValue: "Native runtime",
      }),
      diagnostics.nativeArch ? String(diagnostics.nativeArch) : null,
    ],
    [
      t("settings.advancedSection.ffmpegLabel", { defaultValue: "FFmpeg" }),
      diagnostics.remuxRuntime
        ? diagnostics.remuxRuntime.available
          ? "Available"
          : "Unavailable"
        : null,
    ],
    [
      t("settings.advancedSection.remuxCacheLabel", {
        defaultValue: "Remux cache",
      }),
      diagnostics.remuxCache
        ? `${diagnostics.remuxCache.entryCount ?? 0} files · ${diagnostics.remuxCache.pendingCount ?? 0} pending`
        : null,
    ],
  ];
  const selfTestChecks = diagnostics.selfTest?.checks ?? [];

  return (
    <View style={styles.technicalList}>
      {entries
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
        .map(([label, value]) => (
          <Text
            key={label}
            selectable
            style={[styles.technicalText, { color: colors.textSecondary }]}
          >
            {label}: {value}
          </Text>
        ))}
      {selfTestChecks.map((check) => (
        <Text
          key={check.name}
          selectable
          style={[styles.technicalText, { color: colors.textSecondary }]}
        >
          {check.name}: {check.message}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  subheading: {
    gap: 3,
    marginTop: 4,
  },
  subheadingTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  subheadingCopy: {
    fontSize: 12,
    lineHeight: 17,
  },
  readinessCard: {
    gap: 10,
  },
  readinessTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  readinessCopy: {
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  focusable: {
    borderRadius: 12,
  },
  navigationCard: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  capabilityCard: {
    paddingVertical: 0,
  },
  capabilityRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  capabilityIcon: {
    width: 32,
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  capabilityText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  rowCopy: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
  },
  compactStatus: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44,
  },
  formCard: {
    gap: 16,
  },
  inlineNotice: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
  },
  noticeCopy: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
  },
  disclosureCard: {
    padding: 0,
    overflow: "hidden",
  },
  disclosureRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  technicalContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  technicalList: {
    gap: 6,
  },
  technicalText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  pressed: {
    opacity: 0.7,
  },
});
