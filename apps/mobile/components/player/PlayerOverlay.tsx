import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { CastButton, AirPlayButton } from "./castModules";
import type { StreamStats } from "../../services/streamEngine/IStreamEngine";
import type { Stream } from "@streamer/shared";

interface PlayerOverlayProps {
  currentStream: Stream;
  engineType: string;
  stats: StreamStats;
  onClose: () => void;
  onSettings: () => void;
  onWebCast?: () => void;
}

export function PlayerOverlay({
  currentStream,
  engineType,
  stats,
  onClose,
  onSettings,
  onWebCast,
}: PlayerOverlayProps) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Top Bar */}
      <View style={styles.topBar} pointerEvents="auto">
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close player"
        >
          <Text style={styles.closeButtonText}>✕ Close</Text>
        </Pressable>
        <View style={styles.topControls}>
          {CastButton && Platform.OS !== "web" && (
            <CastButton
              style={{ width: 44, height: 44, tintColor: "#e0e0ff" }}
            />
          )}
          {AirPlayButton && Platform.OS === "ios" && (
            <AirPlayButton
              style={{ width: 44, height: 44, tintColor: "#e0e0ff" }}
            />
          )}
          {Platform.OS === "web" && onWebCast && (
            <Pressable
              style={styles.iconButton}
              onPress={onWebCast}
              accessibilityRole="button"
              accessibilityLabel="Cast to Device"
            >
              <MaterialIcons name="cast" size={20} color="#e0e0ff" />
            </Pressable>
          )}
          <Pressable
            style={styles.iconButton}
            onPress={onSettings}
            accessibilityRole="button"
            accessibilityLabel="Playback settings"
          >
            <Ionicons name="settings-sharp" size={20} color="#e0e0ff" />
          </Pressable>
        </View>
      </View>

      {/* Info Bar (Bottom) */}
      <View style={styles.infoBar} pointerEvents="auto">
        <Text style={styles.infoTitle}>
          🎬 {currentStream.title || currentStream.name || "Now Playing"}
        </Text>
        <View style={styles.infoSubRow}>
          <Text style={styles.engineText}>Engine: {engineType}</Text>
          {stats.peers > 0 && (
            <Text style={styles.speedText}>
              ↓ {(stats.speed / 1024).toFixed(0)} KB/s · {stats.peers} peers
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  closeButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: { color: "#f8fafc", fontWeight: "600", fontSize: 14 },
  topControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  infoBar: {
    backgroundColor: "rgba(10,10,26,0.95)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 40,
  },
  infoTitle: { color: "#f8fafc", fontWeight: "bold", fontSize: 15 },
  infoSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  engineText: { color: "#a1a1aa", fontSize: 11 },
  speedText: { color: "#818cf8", fontSize: 11, fontWeight: "600" },
});
