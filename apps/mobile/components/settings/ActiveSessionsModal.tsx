import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";

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
  const { colors } = useTheme();
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
              Active Sessions
            </Text>
          </View>
          {!inline && (
            <Pressable onPress={onClose}>
              <Text style={[styles.modalCancel, { color: colors.tint }]}>
                Done
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
                  ? "Just now"
                  : diffMin < 60
                    ? `${diffMin}m ago`
                    : `${Math.floor(diffMin / 60)}h ago`;

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
                        ? "This device"
                        : (session.userAgent?.slice(0, 40) ?? "Unknown device")}
                    </Text>
                    <Text
                      style={[
                        styles.sessionMeta,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {session.ipAddress ?? "Unknown IP"} · {lastSeenLabel}
                    </Text>
                  </View>
                  {!isCurrentDevice && (
                    <Pressable
                      onPress={() => revokeSession(session.id)}
                      hitSlop={8}
                      testID={`btn-revoke-session-${session.id}`}
                      accessibilityRole="button"
                      accessibilityLabel="Revoke this session"
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
      animationType="slide"
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
});
