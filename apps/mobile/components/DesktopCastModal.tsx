import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export interface CastDevice {
  id: string;
  name: string;
  type: string;
}

interface Props {
  visible: boolean;
  playbackUri: string;
  title: string;
  onClose: () => void;
  onCastStart?: (device: CastDevice) => void;
}

export function DesktopCastModal({
  visible,
  playbackUri,
  title,
  onClose,
  onCastStart,
}: Props) {
  const [devices, setDevices] = useState<CastDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [castingTo, setCastingTo] = useState<string | null>(null);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      // Assumes stream-server is running alongside the desktop app
      const res = await fetch("http://localhost:11470/api/cast/devices");
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
      }
    } catch (e) {
      console.error("Failed to fetch cast devices:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchDevices();
      setCastingTo(null);
    }
  }, [visible]);

  const handleCast = async (device: CastDevice) => {
    setCastingTo(device.id);
    try {
      const res = await fetch("http://localhost:11470/api/cast/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: device.id, url: playbackUri, title }),
      });
      if (res.ok) {
        // Success, could show a toast or auto-close
        if (onCastStart) {
          onCastStart(device);
        }
        setTimeout(onClose, 1000);
      } else {
        console.error("Failed to cast:", await res.text());
        setCastingTo(null);
      }
    } catch (e) {
      console.error("Cast error:", e);
      setCastingTo(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      {/* Overlay with slight blur for web */}
      <View
        style={[
          styles.overlay,
          Platform.OS === "web" && ({ backdropFilter: "blur(12px)" } as any),
        ]}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.headerTextContainer}>
              <MaterialIcons
                name="cast"
                size={24}
                color="#a5b4fc"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.title}>Cast to Device</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [
                styles.closeBtnWrapper,
                pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
              ]}
            >
              <MaterialIcons name="close" size={24} color="#9ca3af" />
            </Pressable>
          </View>

          {loading && devices.length === 0 ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#818cf8" />
              <Text style={styles.emptyText}>Searching for devices...</Text>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.centerBox}>
              <MaterialIcons name="tv-off" size={48} color="#4b5563" />
              <Text style={styles.emptyText}>No devices found on network</Text>
            </View>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(d) => d.id}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => {
                const isCasting = castingTo === item.id;
                const iconName =
                  item.type === "chromecast" ? "cast" : "airplay";
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.deviceItem,
                      isCasting && styles.deviceItemActive,
                      pressed &&
                        !isCasting && {
                          opacity: 0.8,
                          transform: [{ scale: 0.98 }],
                        },
                    ]}
                    onPress={() => handleCast(item)}
                    disabled={castingTo !== null}
                  >
                    <View style={styles.deviceInfoContainer}>
                      <MaterialIcons
                        name={iconName}
                        size={28}
                        color={isCasting ? "#fff" : "#a5b4fc"}
                      />
                      <View style={styles.deviceTextCol}>
                        <Text
                          style={[
                            styles.deviceName,
                            isCasting && { color: "#fff" },
                          ]}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={[
                            styles.deviceType,
                            isCasting && { color: "#e0e7ff" },
                          ]}
                        >
                          {isCasting
                            ? "Connecting to display..."
                            : `Available • ${item.type}`}
                        </Text>
                      </View>
                    </View>
                    {isCasting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons
                        name="chevron-right"
                        size={24}
                        color="#6b7280"
                      />
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            style={styles.refreshBtn}
            onPress={fetchDevices}
            disabled={loading}
          >
            <MaterialIcons
              name="refresh"
              size={20}
              color={loading ? "#6b7280" : "#e5e7eb"}
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.refreshText, loading && { color: "#6b7280" }]}>
              {loading ? "Scanning..." : "Refresh Devices"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "rgba(17, 24, 39, 0.85)", // dark gray/blue, slightly transparent
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    boxShadow: [
      {
        color: "rgba(0, 0, 0, 0.5)",
        offsetX: 0,
        offsetY: 10,
        blurRadius: 20,
      },
    ],
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  headerTextContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  closeBtnWrapper: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 6,
    borderRadius: 20,
  },
  loader: {
    marginVertical: 20,
  },
  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 12,
    fontSize: 16,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  deviceItemActive: {
    backgroundColor: "rgba(79, 70, 229, 0.3)",
    borderColor: "#6366f1",
  },
  deviceInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  deviceTextCol: {
    justifyContent: "center",
  },
  deviceName: {
    color: "#f3f4f6",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  deviceType: {
    color: "#9ca3af",
    fontSize: 12,
    textTransform: "capitalize",
  },
  refreshBtn: {
    marginTop: 24,
    padding: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  refreshText: {
    color: "#9ca3af",
    fontWeight: "500",
    fontSize: 14,
  },
});
