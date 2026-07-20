import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getWebFocusStyle } from "../ui/designSystem";
import { playerChrome } from "./playerChrome";

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
    <View
      style={[styles.container, { backgroundColor: playerChrome.scrim }]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: playerChrome.surfaceStrong,
            borderColor: playerChrome.border,
          },
        ]}
      >
        <Text style={[styles.upNext, { color: playerChrome.accent }]}>
          {t("player.upsell.upNext")}
        </Text>
        <Text style={[styles.title, { color: playerChrome.text }]}>
          {nextEpisode.title}
        </Text>
        <Text style={[styles.info, { color: playerChrome.textMuted }]}>
          S{nextEpisode.season} E{nextEpisode.episode}
        </Text>

        <View
          style={[
            styles.progressContainer,
            { backgroundColor: playerChrome.border },
          ]}
        >
          <View
            style={[
              styles.progressBar,
              {
                width: `${(timeLeft / countdownSeconds) * 100}%`,
                backgroundColor: playerChrome.accent,
              },
            ]}
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed, focused }: any) => [
              styles.cancelButton,
              {
                backgroundColor: playerChrome.surface,
                borderColor: playerChrome.border,
                opacity: pressed ? 0.78 : 1,
              },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(playerChrome.focus),
            ]}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t("player.upsell.cancel")}
          >
            <Text
              style={[styles.cancelText, { color: playerChrome.textMuted }]}
            >
              {t("player.upsell.cancel")}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed, focused }: any) => [
              styles.watchNowButton,
              {
                backgroundColor: playerChrome.text,
                opacity: pressed ? 0.82 : 1,
              },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(playerChrome.focus),
            ]}
            onPress={onWatchedNow}
            accessibilityRole="button"
            accessibilityLabel={t("player.upsell.watchNow", { timeLeft })}
          >
            <Ionicons name="play" size={20} color={playerChrome.canvas} />
            <Text style={[styles.watchNowText, { color: playerChrome.canvas }]}>
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
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 80,
    zIndex: 100,
  },
  card: {
    width: "90%",
    maxWidth: 400,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
  },
  upNext: {
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
  },
  info: {
    fontSize: 16,
    marginBottom: 24,
  },
  progressContainer: {
    height: 4,
    borderRadius: 2,
    marginBottom: 24,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
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
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  watchNowButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  watchNowText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
