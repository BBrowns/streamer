import React, { useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
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
import { useWindowClass } from "../../hooks/useWindowClass";
import { useReducedMotion } from "../../hooks/useReducedMotion";

function formatCastTime(seconds = 0) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function RemoteControlBar() {
  const { otherActiveSessions, sendCommand } = useRemoteControl();
  const activeCast = useCastStore((state) => state.activeCast);
  const setCastPaused = useCastStore((state) => state.setCastPaused);
  const setCastStatus = useCastStore((state) => state.setCastStatus);
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { isCompact } = useWindowClass();
  const reducedMotion = useReducedMotion();

  const refreshCastStatus = useCallback(async () => {
    if (!activeCast) return;
    try {
      setCastStatus(await castService.getStatus(activeCast.device.id));
    } catch {
      // Keep the last known state while the bridge or display reconnects.
    }
  }, [activeCast, setCastStatus]);

  useEffect(() => {
    if (!activeCast) return;
    void refreshCastStatus();
    const timer = setInterval(() => void refreshCastStatus(), 5000);
    return () => clearInterval(timer);
  }, [activeCast, refreshCastStatus]);

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

  const handleSeek = async (delta: number) => {
    if (!activeCast) return;
    hapticImpactLight();
    const nextPosition = Math.min(
      activeCast.duration || Number.POSITIVE_INFINITY,
      Math.max(0, (activeCast.currentTime || 0) + delta),
    );
    await castService.control(activeCast.device.id, "seek", nextPosition);
    await refreshCastStatus();
  };

  const castProgress =
    activeCast?.duration && activeCast.duration > 0
      ? Math.min(
          100,
          ((activeCast.currentTime || 0) / activeCast.duration) * 100,
        )
      : 0;

  return (
    <Animated.View
      entering={
        reducedMotion
          ? FadeIn.duration(120)
          : SlideInDown.duration(400).springify()
      }
      exiting={
        reducedMotion ? FadeOut.duration(120) : SlideOutDown.duration(300)
      }
      style={[styles.wrapper, !isCompact && styles.wrapperWide]}
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
            {activeCast?.duration ? (
              <View style={styles.progressRow}>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: colors.disabled },
                  ]}
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: Math.round(activeCast.duration),
                    now: Math.round(activeCast.currentTime || 0),
                  }}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${castProgress}%`,
                        backgroundColor: colors.tint,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[styles.timeText, { color: colors.textSecondary }]}
                >
                  {formatCastTime(activeCast.currentTime)} /{" "}
                  {formatCastTime(activeCast.duration)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.right}>
          {activeCast ? (
            <Pressable
              onPress={() => handleSeek(-10)}
              style={[styles.seekBtn, { backgroundColor: colors.card }]}
              accessibilityRole="button"
              accessibilityLabel="Seek cast back 10 seconds"
            >
              <Ionicons name="play-back" size={18} color={colors.text} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleTogglePlay}
            style={[styles.controlBtn, { backgroundColor: colors.tint + "15" }]}
            accessibilityRole="button"
            accessibilityLabel={
              isPaused ? "Resume remote playback" : "Pause remote playback"
            }
          >
            <Ionicons
              name={isPaused ? "play" : "pause"}
              size={24}
              color={colors.text}
            />
          </Pressable>
          {activeCast ? (
            <Pressable
              onPress={() => handleSeek(10)}
              style={[styles.seekBtn, { backgroundColor: colors.card }]}
              accessibilityRole="button"
              accessibilityLabel="Seek cast forward 10 seconds"
            >
              <Ionicons name="play-forward" size={18} color={colors.text} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleTakeOver}
            style={[styles.takeOverBtn, { backgroundColor: colors.tint }]}
          >
            <Text style={[styles.takeOverText, { color: colors.onTint }]}>
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
    maxWidth: 680,
    alignSelf: "center",
    left: "auto",
    right: "auto",
    width: 680,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
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
  progressRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    maxWidth: 180,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%" },
  timeText: { fontSize: 10, fontVariant: ["tabular-nums"] },
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
    justifyContent: "center",
    alignItems: "center",
  },
  seekBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  takeOverBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  takeOverText: {
    fontSize: 13,
    fontWeight: "800",
  },
});
