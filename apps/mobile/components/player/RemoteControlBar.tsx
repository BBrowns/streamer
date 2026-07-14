import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRemoteControl } from "../../hooks/useRemoteControl";
import { useTheme } from "../../hooks/useTheme";
import { BlurView } from "expo-blur";
import Animated, {
  SlideInDown,
  SlideOutDown,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { hapticImpactLight } from "../../lib/haptics";
import { useCastStore } from "../../stores/castStore";
import { castService } from "../../services/CastService";

export function RemoteControlBar() {
  const { otherActiveSessions, sendCommand } = useRemoteControl();
  const activeCast = useCastStore((state) => state.activeCast);
  const setCastPaused = useCastStore((state) => state.setCastPaused);
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  if (otherActiveSessions.length === 0 && !activeCast) return null;

  // For simplicity, take the first active other session
  const session = otherActiveSessions[0];
  const isPaused = activeCast?.isPaused ?? session?.status !== "playing";

  const handleTogglePlay = async () => {
    hapticImpactLight();
    if (activeCast) {
      const nextPaused = !isPaused;
      await castService.control(
        activeCast.device.id,
        nextPaused ? "pause" : "play",
      );
      setCastPaused(nextPaused);
      return;
    }
    const newAction = session.status === "playing" ? "pause" : "play";
    sendCommand({
      targetDeviceId: session.deviceId,
      action: newAction,
    });
  };

  const handleTakeOver = () => {
    hapticImpactLight();
    if (activeCast) {
      router.push("/player");
      return;
    }
    if (session.itemId) {
      router.push({
        pathname: "/player",
        params: {
          id: session.itemId,
          startTime: session.position || 0,
        },
      } as any);
    }
  };

  return (
    <Animated.View
      entering={SlideInDown.duration(400).springify()}
      exiting={SlideOutDown.duration(300)}
      style={[styles.wrapper, width > 600 && styles.wrapperWide]}
    >
      <BlurView
        intensity={90}
        tint={isDark ? "dark" : "light"}
        style={[styles.container, { borderColor: colors.border }]}
      >
        <View style={styles.left}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: colors.tint + "15" },
            ]}
          >
            <Ionicons name="tv-outline" size={20} color={colors.tint} />
          </View>
          <View style={styles.info}>
            <Text style={[styles.deviceText, { color: colors.textSecondary }]}>
              {activeCast
                ? `Casting to ${activeCast.device.name}`
                : `Active on ${session.deviceName || "Another Device"}`}
            </Text>
            <Text
              style={[styles.itemText, { color: colors.text }]}
              numberOfLines={1}
            >
              {isPaused ? "Paused" : "Playing"}:{" "}
              {activeCast?.mediaInfo.title ||
                session.itemTitle ||
                "Unknown Content"}
            </Text>
          </View>
        </View>

        <View style={styles.right}>
          <Pressable
            onPress={handleTogglePlay}
            style={[styles.controlBtn, { backgroundColor: colors.tint + "15" }]}
          >
            <Ionicons
              name={isPaused ? "play" : "pause"}
              size={24}
              color={colors.text}
            />
          </Pressable>
          <Pressable
            onPress={handleTakeOver}
            style={[styles.takeOverBtn, { backgroundColor: colors.tint }]}
          >
            <Text
              style={[styles.takeOverText, { color: isDark ? "#000" : "#fff" }]}
            >
              {activeCast ? "Open player" : "Take Over"}
            </Text>
          </Pressable>
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 90 : 70, // Above tab bar
    left: 10,
    right: 10,
    zIndex: 1000,
  },
  wrapperWide: {
    maxWidth: 500,
    alignSelf: "center",
    left: "auto",
    right: "auto",
    width: 500,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 4px 10px rgba(0, 0, 0, 0.3)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
        }),
    elevation: 8,
  } as any,
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    flex: 1,
  },
  deviceText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  takeOverBtn: {
    backgroundColor: "#d8b4fe",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  takeOverText: {
    color: "#2c1738",
    fontSize: 13,
    fontWeight: "800",
  },
});
