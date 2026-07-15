import React, { useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRemoteControl } from "../../hooks/useRemoteControl";
import { useTheme } from "../../hooks/useTheme";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { hapticImpactLight } from "../../lib/haptics";
import { useCastStore } from "../../stores/castStore";
import { castService } from "../../services/CastService";
import { useWindowClass } from "../../hooks/useWindowClass";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTranslation } from "react-i18next";
import { AppButton } from "../ui/AppButton";
import {
  getWebFocusStyle,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";

function formatCastTime(seconds = 0) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function RemoteIconButton({
  icon,
  label,
  onPress,
  primary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, focused }: any) => [
        styles.iconButton,
        {
          backgroundColor: primary ? colors.primary : colors.surfaceElevated,
          opacity: pressed ? 0.76 : 1,
        },
        Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={primary ? 22 : 19}
        color={primary ? colors.onPrimary : colors.text}
      />
    </Pressable>
  );
}

export function RemoteControlBar() {
  const { otherActiveSessions, sendCommand } = useRemoteControl();
  const activeCast = useCastStore((state) => state.activeCast);
  const setCastPaused = useCastStore((state) => state.setCastPaused);
  const setCastStatus = useCastStore((state) => state.setCastStatus);
  const { colors } = useTheme();
  const { t } = useTranslation();
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
        reducedMotion ? undefined : SlideInDown.duration(400).springify()
      }
      exiting={reducedMotion ? undefined : SlideOutDown.duration(300)}
      style={[styles.wrapper, !isCompact && styles.wrapperWide]}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: colors.surfaceOverlay },
          isCompact && styles.containerCompact,
        ]}
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
                ? t("player.remote.castingTo", {
                    name: activeCast.device.name,
                    defaultValue: "Casting to {{name}}",
                  })
                : t("player.remote.activeOn", {
                    name:
                      session.deviceName ||
                      t("player.remote.anotherDevice", {
                        defaultValue: "another device",
                      }),
                    defaultValue: "Active on {{name}}",
                  })}
            </Text>
            <Text
              style={[styles.itemText, { color: colors.text }]}
              numberOfLines={1}
            >
              {isPaused
                ? t("player.remote.paused", { defaultValue: "Paused" })
                : t("player.remote.playing", { defaultValue: "Playing" })}
              :{" "}
              {activeCast?.mediaInfo.title ||
                session.itemTitle ||
                t("player.remote.unknownContent", {
                  defaultValue: "Unknown title",
                })}
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

        <View style={[styles.right, isCompact && styles.rightCompact]}>
          {activeCast ? (
            <RemoteIconButton
              onPress={() => handleSeek(-10)}
              icon="play-back"
              label={t("player.remote.seekBack", {
                defaultValue: "Seek cast back 10 seconds",
              })}
            />
          ) : null}
          <RemoteIconButton
            onPress={handleTogglePlay}
            icon={isPaused ? "play" : "pause"}
            label={
              isPaused
                ? t("player.remote.resume", {
                    defaultValue: "Resume remote playback",
                  })
                : t("player.remote.pause", {
                    defaultValue: "Pause remote playback",
                  })
            }
            primary
          />
          {activeCast ? (
            <RemoteIconButton
              onPress={() => handleSeek(10)}
              icon="play-forward"
              label={t("player.remote.seekForward", {
                defaultValue: "Seek cast forward 10 seconds",
              })}
            />
          ) : null}
          <AppButton
            onPress={handleTakeOver}
            variant="secondary"
            size="small"
            icon="expand-outline"
            label={
              activeCast
                ? t("player.remote.openPlayer", {
                    defaultValue: "Open player",
                  })
                : t("player.remote.takeOver", { defaultValue: "Take over" })
            }
          />
        </View>
      </View>
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
    padding: uiSpacing.md,
    borderRadius: uiRadii.sheet,
    overflow: "hidden",
    borderWidth: 0,
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
  containerCompact: {
    alignItems: "stretch",
    flexDirection: "column",
    gap: uiSpacing.md,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: uiSpacing.md,
  },
  iconContainer: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.control,
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
  timeText: {
    ...uiTypography.caption,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  deviceText: {
    ...uiTypography.sectionLabel,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemText: {
    ...uiTypography.label,
    fontSize: 14,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiSpacing.sm,
  },
  rightCompact: {
    alignSelf: "flex-end",
  },
  iconButton: {
    width: uiTouchTarget,
    height: uiTouchTarget,
    borderRadius: uiRadii.control,
    justifyContent: "center",
    alignItems: "center",
  },
});
