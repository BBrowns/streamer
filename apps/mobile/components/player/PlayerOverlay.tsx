import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import { CastButton, AirPlayButton } from "./castModules";
import type { StreamStats } from "../../services/streamEngine/IStreamEngine";
import type { Stream } from "@streamer/shared";
import { getWebFocusStyle } from "../ui/designSystem";

interface PlayerOverlayProps {
  currentStream: Stream;
  engineType: string;
  stats: StreamStats;
  onClose: () => void;
  onSettings: () => void;
  onWebCast?: () => void;
  onTogglePiP?: () => void;
  isPiPSupported?: boolean;
  showInfoBar?: boolean;
}

export function PlayerOverlay({
  currentStream,
  engineType: _engineType,
  stats,
  onClose,
  onSettings,
  onWebCast,
  onTogglePiP,
  isPiPSupported = false,
  showInfoBar = true,
}: PlayerOverlayProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.overlay}>
      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.surfaceOverlay,
            paddingTop: Platform.OS === "web" ? 20 : 60,
          },
        ]}
      >
        <Pressable
          style={({ hovered, focused }: any) => [
            styles.closeButton,
            { backgroundColor: colors.surfaceElevated },
            hovered && {
              backgroundColor: colors.card,
              transform: [{ scale: 1.05 }],
            },
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
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
              style={({ hovered, focused }: any) => [
                styles.iconButton,
                { backgroundColor: colors.surfaceElevated },
                hovered && {
                  backgroundColor: colors.card,
                  transform: [{ scale: 1.1 }],
                },
                focused && getWebFocusStyle(colors.focus),
              ]}
              onPress={onWebCast}
              accessibilityRole="button"
              accessibilityLabel={t("common.actions.castToDevice", {
                defaultValue: "Cast to device",
              })}
            >
              <MaterialIcons name="cast" size={20} color={colors.text} />
            </Pressable>
          )}
          {isPiPSupported && onTogglePiP && (
            <Pressable
              style={({ hovered, focused }: any) => [
                styles.iconButton,
                { backgroundColor: colors.surfaceElevated },
                hovered && {
                  backgroundColor: colors.card,
                  transform: [{ scale: 1.1 }],
                },
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.focus),
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
            style={({ hovered, focused }: any) => [
              styles.iconButton,
              { backgroundColor: colors.surfaceElevated },
              hovered && {
                backgroundColor: colors.card,
                transform: [{ scale: 1.1 }],
              },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(colors.focus),
            ]}
            onPress={onSettings}
            accessibilityRole="button"
            accessibilityLabel="Playback settings"
          >
            <Ionicons name="settings-sharp" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {showInfoBar ? (
        <View
          testID="player-stream-info"
          style={[
            styles.infoBar,
            {
              backgroundColor: colors.surfaceOverlay,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            🎬{" "}
            {currentStream.title ||
              currentStream.name ||
              t("player.controls.nowPlaying")}
          </Text>
          <View style={styles.infoSubRow}>
            {stats.peers > 0 && (
              <Text style={[styles.speedText, { color: colors.textSecondary }]}>
                ↓ {(stats.speed / 1024).toFixed(0)} KB/s · {stats.peers}{" "}
                {t("player.controls.peers")}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View />
      )}
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
    justifyContent: "flex-start",
    pointerEvents: "none",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 8,
    pointerEvents: "auto",
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: { fontWeight: "600", fontSize: 14 },
  topControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  infoBar: {
    alignSelf: "center",
    width: "94%",
    maxWidth: 920,
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    pointerEvents: "auto",
  },
  infoTitle: { fontWeight: "bold", fontSize: 15 },
  infoSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  speedText: { fontSize: 11, fontWeight: "600" },
});
