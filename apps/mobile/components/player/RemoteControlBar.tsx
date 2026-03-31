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
import { BlurView } from "expo-blur";
import Animated, {
  SlideInDown,
  SlideOutDown,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { hapticImpactLight } from "../../lib/haptics";

export function RemoteControlBar() {
  const { otherActiveSessions, sendCommand } = useRemoteControl();
  const router = useRouter();
  const { width } = useWindowDimensions();

  if (otherActiveSessions.length === 0) return null;

  // For simplicity, take the first active other session
  const session = otherActiveSessions[0];

  const handleTogglePlay = () => {
    hapticImpactLight();
    const newAction = session.status === "playing" ? "pause" : "play";
    sendCommand({
      targetDeviceId: session.deviceId,
      action: newAction,
    });
  };

  const handleTakeOver = () => {
    hapticImpactLight();
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
      <BlurView intensity={90} tint="dark" style={styles.container}>
        <View style={styles.left}>
          <View style={styles.iconContainer}>
            <Ionicons name="tv-outline" size={20} color="#00f2ff" />
          </View>
          <View style={styles.info}>
            <Text style={styles.deviceText}>
              Active on {session.deviceName || "Another Device"}
            </Text>
            <Text style={styles.itemText} numberOfLines={1}>
              {session.status === "playing" ? "Playing" : "Paused"}:{" "}
              {session.itemTitle || "Unknown Content"}
            </Text>
          </View>
        </View>

        <View style={styles.right}>
          <Pressable onPress={handleTogglePlay} style={styles.controlBtn}>
            <Ionicons
              name={session.status === "playing" ? "pause" : "play"}
              size={24}
              color="#ffffff"
            />
          </Pressable>
          <Pressable onPress={handleTakeOver} style={styles.takeOverBtn}>
            <Text style={styles.takeOverText}>Take Over</Text>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
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
    backgroundColor: "#00f2ff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  takeOverText: {
    color: "#010101",
    fontSize: 13,
    fontWeight: "800",
  },
});
