import { View, Text, StyleSheet, Pressable } from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";

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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
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
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.upNext, { color: colors.tint }]}>
          {t("player.upsell.upNext")}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          {nextEpisode.title}
        </Text>
        <Text style={[styles.info, { color: colors.textSecondary }]}>
          S{nextEpisode.season} E{nextEpisode.episode}
        </Text>

        <View
          style={[styles.progressContainer, { backgroundColor: colors.border }]}
        >
          <View
            style={[
              styles.progressBar,
              {
                width: `${(timeLeft / countdownSeconds) * 100}%`,
                backgroundColor: colors.tint,
              },
            ]}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[
              styles.cancelButton,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(0,0,0,0.05)",
              },
            ]}
            onPress={onCancel}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
              {t("player.upsell.cancel")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.watchNowButton, { backgroundColor: colors.tint }]}
            onPress={onWatchedNow}
          >
            <Ionicons name="play" size={20} color={isDark ? "#000" : "#fff"} />
            <Text
              style={[styles.watchNowText, { color: isDark ? "#000" : "#fff" }]}
            >
              {t("player.upsell.watchNow", { timeLeft })}
            </Text>
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
