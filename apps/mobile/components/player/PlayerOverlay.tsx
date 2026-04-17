import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
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
  onTogglePiP?: () => void;
  isPiPSupported?: boolean;
}

export function PlayerOverlay({
  currentStream,
  engineType,
  stats,
  onClose,
  onSettings,
  onWebCast,
  onTogglePiP,
  isPiPSupported = false,
}: PlayerOverlayProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: isDark
              ? "rgba(0,0,0,0.8)"
              : "rgba(255,255,255,0.85)",
            paddingTop: Platform.OS === "web" ? 20 : 60,
          },
        ]}
        pointerEvents="auto"
      >
        <Pressable
          style={({ hovered }: any) => [
            styles.closeButton,
            { backgroundColor: colors.tint + "15" },
            hovered && {
              backgroundColor: colors.tint + "25",
              transform: [{ scale: 1.05 }],
            },
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("player.controls.close")}
        >
          <Text style={[styles.closeButtonText, { color: colors.text }]}>
            ✕ {t("player.controls.close")}
          </Text>
        </Pressable>
        <View style={styles.topControls}>
          {CastButton && Platform.OS !== "web" && (
            <CastButton
              style={{ width: 44, height: 44, tintColor: colors.text }}
            />
          )}
          {AirPlayButton && Platform.OS === "ios" && (
            <AirPlayButton
              style={{ width: 44, height: 44, tintColor: colors.text }}
            />
          )}
          {Platform.OS === "web" && onWebCast && (
            <Pressable
              style={({ hovered }: any) => [
                styles.iconButton,
                { backgroundColor: colors.tint + "15" },
                hovered && {
                  backgroundColor: colors.tint + "25",
                  transform: [{ scale: 1.1 }],
                },
              ]}
              onPress={onWebCast}
              accessibilityRole="button"
              accessibilityLabel="Cast to Device"
            >
              <MaterialIcons name="cast" size={20} color={colors.text} />
            </Pressable>
          )}
          {isPiPSupported && onTogglePiP && (
            <Pressable
              style={({ hovered }: any) => [
                styles.iconButton,
                { backgroundColor: colors.tint + "15" },
                hovered && {
                  backgroundColor: colors.tint + "25",
                  transform: [{ scale: 1.1 }],
                },
              ]}
              onPress={onTogglePiP}
              accessibilityRole="button"
              accessibilityLabel="Picture in Picture"
            >
              <MaterialIcons
                name="picture-in-picture-alt"
                size={20}
                color={colors.text}
              />
            </Pressable>
          )}
          <Pressable
            style={({ hovered }: any) => [
              styles.iconButton,
              { backgroundColor: colors.tint + "15" },
              hovered && {
                backgroundColor: colors.tint + "25",
                transform: [{ scale: 1.1 }],
              },
            ]}
            onPress={onSettings}
            accessibilityRole="button"
            accessibilityLabel="Playback settings"
          >
            <Ionicons name="settings-sharp" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Info Bar (Bottom) */}
      <View
        style={[
          styles.infoBar,
          {
            backgroundColor: isDark
              ? "rgba(10,10,26,0.95)"
              : "rgba(255,255,255,0.95)",
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingBottom: Platform.OS === "web" ? 20 : 40,
          },
        ]}
        pointerEvents="auto"
      >
        <Text style={[styles.infoTitle, { color: colors.text }]}>
          🎬{" "}
          {currentStream.title ||
            currentStream.name ||
            t("player.controls.nowPlaying")}
        </Text>
        <View style={styles.infoSubRow}>
          <Text style={[styles.engineText, { color: colors.textSecondary }]}>
            {t("player.controls.engine")}: {engineType}
          </Text>
          {stats.peers > 0 && (
            <Text style={[styles.speedText, { color: colors.tint }]}>
              ↓ {(stats.speed / 1024).toFixed(0)} KB/s · {stats.peers}{" "}
              {t("player.controls.peers")}
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
