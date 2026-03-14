import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";

/**
 * Banner displayed when the device is offline.
 * Uses Ionicons wifi-outline for a professional look.
 */
export const OfflineBanner = () => {
  const netInfo = useNetInfo();

  if (netInfo.isConnected !== false) return null;

  return (
    <View style={styles.container}>
      <Ionicons
        name="wifi-outline"
        size={18}
        color="#00f2ff"
        style={styles.icon}
      />
      <Text style={styles.text}>You are currently offline</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 242, 255, 0.2)",
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: "#00f2ff",
    fontSize: 14,
    fontWeight: "600",
  },
});
