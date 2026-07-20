import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { CastButton, AirPlayButton } from "./castModules";
import type { StreamStats } from "../../services/streamEngine/IStreamEngine";
import type { Stream } from "@streamer/shared";
import { getWebFocusStyle } from "../ui/designSystem";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { playerChrome } from "./playerChrome";

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* Top Bar */}
      <View
        testID="player-top-chrome"
        pointerEvents="box-none"
        style={[
          styles.topBar,
          {
            paddingTop:
              Platform.OS === "web" ? 16 : Math.max(insets.top + 12, 24),
          },
        ]}
      >
        <Pressable
          testID="player-close-button"
          style={({ pressed, hovered, focused }: any) => [
            styles.closeButton,
            { opacity: pressed ? 0.76 : 1 },
            hovered &&
              (reducedMotion
                ? styles.hoveredButtonReducedMotion
                : styles.hoveredButton),
            Platform.OS === "web" &&
              focused &&
              getWebFocusStyle(playerChrome.focus),
          ]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("player.controls.close")}
        >
          <Ionicons name="close" size={24} color={playerChrome.text} />
        </Pressable>
        <View style={styles.topControls}>
          {CastButton && Platform.OS !== "web" && (
            <CastButton
              style={{ width: 44, height: 44, tintColor: playerChrome.text }}
            />
          )}
          {AirPlayButton && Platform.OS === "ios" && (
            <AirPlayButton
              style={{ width: 44, height: 44, tintColor: playerChrome.text }}
            />
          )}
          {Platform.OS === "web" && onWebCast && (
            <Pressable
              style={({ pressed, hovered, focused }: any) => [
                styles.iconButton,
                { opacity: pressed ? 0.76 : 1 },
                hovered &&
                  (reducedMotion
                    ? styles.hoveredButtonReducedMotion
                    : styles.hoveredButton),
                focused && getWebFocusStyle(playerChrome.focus),
              ]}
              onPress={onWebCast}
              accessibilityRole="button"
              accessibilityLabel={t("common.actions.castToDevice", {
                defaultValue: "Cast to device",
              })}
            >
              <MaterialIcons name="cast" size={20} color={playerChrome.text} />
            </Pressable>
          )}
          {isPiPSupported && onTogglePiP && (
            <Pressable
              style={({ pressed, hovered, focused }: any) => [
                styles.iconButton,
                { opacity: pressed ? 0.76 : 1 },
                hovered &&
                  (reducedMotion
                    ? styles.hoveredButtonReducedMotion
                    : styles.hoveredButton),
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(playerChrome.focus),
              ]}
              onPress={onTogglePiP}
              accessibilityRole="button"
              accessibilityLabel="Picture in Picture"
            >
              <MaterialIcons
                name="picture-in-picture-alt"
                size={20}
                color={playerChrome.text}
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
              backgroundColor: playerChrome.surfaceStrong,
              borderTopWidth: 1,
              borderTopColor: playerChrome.border,
            },
          ]}
        >
          <Text style={[styles.infoTitle, { color: playerChrome.text }]}>
            🎬{" "}
            {currentStream.title ||
              currentStream.name ||
              t("player.controls.nowPlaying")}
          </Text>
          <View style={styles.infoSubRow}>
            {stats.peers > 0 && (
              <Text
                style={[styles.speedText, { color: playerChrome.textMuted }]}
              >
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
    backgroundColor: playerChrome.surface,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: playerChrome.border,
    backgroundColor: playerChrome.surfaceStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  topControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: playerChrome.border,
    backgroundColor: playerChrome.surfaceStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  hoveredButton: {
    backgroundColor: playerChrome.surfaceHover,
    transform: [{ scale: 1.04 }],
  },
  hoveredButtonReducedMotion: {
    backgroundColor: playerChrome.surfaceHover,
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
