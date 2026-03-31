import { View, Text, StyleSheet, Pressable } from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";

interface NextEpisodeOverlayProps {
  isVisible: boolean;
  nextEpisode: {
    title: string;
    season: number;
    episode: number;
  };
  onWatchedNow: () => void;
  onCancel: () => void;
  countdownSeconds?: number;
}

export function NextEpisodeOverlay({
  isVisible,
  nextEpisode,
  onWatchedNow,
  onCancel,
  countdownSeconds = 10,
}: NextEpisodeOverlayProps) {
  const [timeLeft, setTimeLeft] = useState(countdownSeconds);

  useEffect(() => {
    if (!isVisible) {
      setTimeLeft(countdownSeconds);
      return;
    }

    if (timeLeft <= 0) {
      onWatchedNow();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible, timeLeft, onWatchedNow, countdownSeconds]);

  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.upNext}>UP NEXT</Text>
        <Text style={styles.title}>{nextEpisode.title}</Text>
        <Text style={styles.info}>
          S{nextEpisode.season} E{nextEpisode.episode}
        </Text>

        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressBar,
              { width: `${(timeLeft / countdownSeconds) * 100}%` },
            ]}
          />
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.watchNowButton} onPress={onWatchedNow}>
            <Ionicons name="play" size={20} color="#000" />
            <Text style={styles.watchNowText}>Watch Now ({timeLeft}s)</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 80,
    zIndex: 100,
  },
  card: {
    backgroundColor: "#1e1e2e",
    width: "90%",
    maxWidth: 400,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#313244",
  },
  upNext: {
    color: "#89b4fa",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    color: "#cdd6f4",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
  },
  info: {
    color: "#a6adc8",
    fontSize: 16,
    marginBottom: 24,
  },
  progressContainer: {
    height: 4,
    backgroundColor: "#313244",
    borderRadius: 2,
    marginBottom: 24,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#89b4fa",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#313244",
  },
  cancelText: {
    color: "#cdd6f4",
    fontSize: 14,
    fontWeight: "600",
  },
  watchNowButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#89b4fa",
    gap: 8,
  },
  watchNowText: {
    color: "#11111b",
    fontSize: 14,
    fontWeight: "700",
  },
});
