import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
  const content = (
    <View style={inline ? styles.inlineContent : styles.modalBg}>
      <View
        style={[
          inline ? styles.inlineCard : styles.modalContent,
          { maxHeight: inline ? "100%" : "75%" },
        ]}
      >
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color="#34d399"
            />
            <Text style={styles.modalTitle}>Active Sessions</Text>
          </View>
          {!inline && (
            <Pressable onPress={onClose}>
              <Text style={styles.modalCancel}>Done</Text>
            </Pressable>
          )}
        </View>
        {isSessionsLoading ? (
          <ActivityIndicator color="#00f2ff" style={{ marginTop: 24 }} />
        ) : (
          sessions.map((session) => {
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
              <View key={session.id} style={styles.sessionRow}>
                <View style={styles.sessionIconWrap}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={20}
                    color={isCurrentDevice ? "#34d399" : "#94a3b8"}
                  />
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionDevice} numberOfLines={1}>
                    {isCurrentDevice
                      ? "This device"
                      : (session.userAgent?.slice(0, 40) ?? "Unknown device")}
                  </Text>
                  <Text style={styles.sessionMeta}>
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
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            );
          })
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
  modalTitle: { color: "#ffffff", fontSize: 20, fontWeight: "900" },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalCancel: { color: "#888888", fontWeight: "800", fontSize: 15 },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 12,
  },
  sessionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  sessionInfo: { flex: 1 },
  sessionDevice: { color: "#f8fafc", fontWeight: "600", fontSize: 14 },
  sessionMeta: { color: "#6b7280", fontSize: 12, marginTop: 2 },
});
