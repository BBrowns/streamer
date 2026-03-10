import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  Platform,
  StyleSheet,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import type { StreamMetrics, StreamLoadState } from "../../stores/playerStore";

interface PlayerStatusOverlayProps {
  streamState: StreamLoadState;
  streamMetrics: StreamMetrics | null;
  isBuffering: boolean;
  errorMessage: string | null;
  onBack: () => void;
}

export function PlayerStatusOverlay({
  streamState,
  streamMetrics,
  isBuffering,
  errorMessage,
  onBack,
}: PlayerStatusOverlayProps) {
  if (streamState === "loading_metrics") {
    return (
      <View style={styles.metricsOverlay}>
        <ActivityIndicator
          size="large"
          color="#818cf8"
          style={styles.spinner}
        />
        <Text style={styles.titleText}>
          {streamMetrics?.state === "finding_peers"
            ? "Finding peers..."
            : streamMetrics?.state === "connecting"
              ? "Connecting to peers..."
              : "Buffering..."}
        </Text>
        {streamMetrics && (
          <Text style={styles.subtitleText}>
            {streamMetrics.numPeers} peers •{" "}
            {(streamMetrics.downloadSpeed / 1024 / 1024).toFixed(2)} MB/s
          </Text>
        )}
      </View>
    );
  }

  if (streamState === "error") {
    const isMkvHint =
      Platform.OS === "ios" &&
      (errorMessage?.toLowerCase().includes("format") ||
        errorMessage?.toLowerCase().includes("codec") ||
        errorMessage?.toLowerCase().includes("could not") ||
        errorMessage?.toLowerCase().includes("mkv"));

    return (
      <View style={styles.errorOverlay}>
        <MaterialIcons
          name="error-outline"
          size={48}
          color="#fca5a5"
          style={styles.errorIcon}
        />
        <Text style={styles.errorTitle}>
          {isMkvHint ? "Unsupported Format" : "Connection Failed"}
        </Text>
        <Text style={styles.errorMessage}>
          {isMkvHint
            ? "This stream uses the MKV container format, which iOS cannot play natively. Try using the web player instead."
            : errorMessage || "Unable to load stream"}
        </Text>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Because of the early returns above, streamState at this point is known
  // to be either "idle" | "playing", so we don't need to re-check streamState
  // to satisfy the compiler to avoid "condition always false" lints.
  if (isBuffering) {
    return (
      <View style={styles.bufferingOverlay} pointerEvents="none">
        <ActivityIndicator size="large" color="#818cf8" />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  metricsOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  spinner: { marginBottom: 16 },
  titleText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  subtitleText: { color: "#a1a1aa", marginTop: 8, fontSize: 14 },
  errorOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  errorIcon: { marginBottom: 16 },
  errorTitle: {
    color: "#fca5a5",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  errorMessage: {
    color: "#a1a1aa",
    textAlign: "center",
    maxWidth: 280,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  backButtonText: { color: "#fff", fontWeight: "600" },
  bufferingOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
});
