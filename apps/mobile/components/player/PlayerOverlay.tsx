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
  onWebCast,
  onTogglePiP,
  isPiPSupported = false,
  showInfoBar = true,
}: PlayerOverlayProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Top Bar */}
      <View
        pointerEvents="box-none"
        style={[
          styles.topBar,
          {
            paddingTop: Platform.OS === "web" ? 16 : 56,
          },
        ]}
      >
        <Pressable
          testID="player-close-button"
          style={({ pressed, hovered, focused }: any) => [
            styles.closeButton,
            { opacity: pressed ? 0.76 : 1 },
            hovered && styles.hoveredButton,
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("player.controls.close")}
        >
          <Ionicons name="close" size={24} color="#F4F5F7" />
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
              style={({ pressed, hovered, focused }: any) => [
                styles.iconButton,
                { opacity: pressed ? 0.76 : 1 },
                hovered && styles.hoveredButton,
                focused && getWebFocusStyle(colors.focus),
              ]}
              onPress={onWebCast}
              accessibilityRole="button"
              accessibilityLabel={t("common.actions.castToDevice", {
                defaultValue: "Cast to device",
              })}
            >
              <MaterialIcons name="cast" size={20} color="#F4F5F7" />
            </Pressable>
          )}
          {isPiPSupported && onTogglePiP && (
            <Pressable
              style={({ pressed, hovered, focused }: any) => [
                styles.iconButton,
                { opacity: pressed ? 0.76 : 1 },
                hovered && styles.hoveredButton,
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
                color="#F4F5F7"
              />
            </Pressable>
          )}
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
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(8,9,12,0.68)",
    justifyContent: "center",
    alignItems: "center",
  },
  topControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(8,9,12,0.68)",
    justifyContent: "center",
    alignItems: "center",
  },
  hoveredButton: {
    backgroundColor: "rgba(24,27,33,0.92)",
    transform: [{ scale: 1.04 }],
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
