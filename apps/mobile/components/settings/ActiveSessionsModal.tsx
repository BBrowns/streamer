import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  Platform,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { getWebFocusStyle } from "../ui/designSystem";

interface SessionItem {
  id: string;
  deviceId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  lastActivity: string;
}

interface ActiveSessionsModalProps {
  visible: boolean;
  onClose: () => void;
  sessions: SessionItem[];
  isSessionsLoading: boolean;
  deviceId?: string | null;
  revokeSession: (id: string) => void;
  inline?: boolean;
}

export function ActiveSessionsModal({
  visible,
  onClose,
  sessions,
  isSessionsLoading,
  deviceId,
  revokeSession,
  inline,
}: ActiveSessionsModalProps) {
  const reducedMotion = useReducedMotion();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const content = (
    <View
      style={[
        inline ? styles.inlineContent : styles.modalBg,
        !inline && { backgroundColor: colors.scrim },
      ]}
    >
      <View
        style={[
          inline ? styles.inlineCard : styles.modalContent,
          {
            maxHeight: inline ? "100%" : "82%",
            backgroundColor: inline ? "transparent" : colors.surfaceElevated,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color={colors.success}
            />
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {t("settings.accountModals.sessions.title")}
            </Text>
          </View>
          {!inline && (
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("settings.accountModals.sessions.done")}
              style={({ focused, pressed }: any) => [
                styles.headerAction,
                pressed && styles.pressed,
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.focus),
              ]}
            >
              <Text style={[styles.modalCancel, { color: colors.tint }]}>
                {t("settings.accountModals.sessions.done")}
              </Text>
            </Pressable>
          )}
        </View>
        {isSessionsLoading ? (
          <ActivityIndicator color={colors.tint} style={{ marginTop: 24 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {sessions.map((session) => {
              const isCurrentDevice = session.deviceId === deviceId;
              const lastSeen = new Date(session.lastActivity);
              const diffMs = Date.now() - lastSeen.getTime();
              const diffMin = Math.floor(diffMs / 60_000);
              const lastSeenLabel =
                diffMin < 1
                  ? t("settings.accountModals.sessions.justNow")
                  : diffMin < 60
                    ? t("settings.accountModals.sessions.minutesAgo", {
                        count: diffMin,
                      })
                    : t("settings.accountModals.sessions.hoursAgo", {
                        count: Math.floor(diffMin / 60),
                      });

              return (
                <View
                  key={session.id}
                  style={[
                    styles.sessionRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.sessionIconWrap,
                      { backgroundColor: colors.success + "18" },
                    ]}
                  >
                    <Ionicons
                      name="phone-portrait-outline"
                      size={20}
                      color={
                        isCurrentDevice ? colors.success : colors.textSecondary
                      }
                    />
                  </View>
                  <View style={styles.sessionInfo}>
                    <Text
                      style={[styles.sessionDevice, { color: colors.text }]}
                      numberOfLines={2}
                    >
                      {isCurrentDevice
                        ? t("settings.accountModals.sessions.thisDevice")
                        : (session.userAgent?.slice(0, 40) ??
                          t("settings.accountModals.sessions.unknownDevice"))}
                    </Text>
                    <Text
                      style={[
                        styles.sessionMeta,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {session.ipAddress ??
                        t("settings.accountModals.sessions.unknownIp")}{" "}
                      {" · "}
                      {lastSeenLabel}
                    </Text>
                  </View>
                  {!isCurrentDevice && (
                    <Pressable
                      onPress={() => revokeSession(session.id)}
                      testID={`btn-revoke-session-${session.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        "settings.accountModals.sessions.revokeA11y",
                      )}
                      style={({ focused, pressed }: any) => [
                        styles.iconButton,
                        pressed && styles.pressed,
                        Platform.OS === "web" &&
                          focused &&
                          getWebFocusStyle(colors.focus),
                      ]}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.error}
                      />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );

  if (inline) {
    if (!visible) return null;
    return content;
  }

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? "none" : "slide"}
      transparent
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 50,
    borderTopWidth: 1,
  },
  inlineContent: {
    flex: 1,
  },
  inlineCard: {
    backgroundColor: "transparent",
    padding: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: "900" },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalCancel: { fontWeight: "800", fontSize: 15 },
  headerAction: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  sessionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  sessionInfo: { flex: 1 },
  sessionDevice: { fontWeight: "600", fontSize: 14 },
  sessionMeta: { fontSize: 12, marginTop: 2 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  pressed: { opacity: 0.68 },
});
