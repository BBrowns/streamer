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
  const { colors } = useTheme();
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
      style={[styles.container, { backgroundColor: colors.scrim }]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
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
              { backgroundColor: colors.card, borderColor: colors.border },
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
            <Ionicons name="play" size={20} color={colors.onTint} />
            <Text style={[styles.watchNowText, { color: colors.onTint }]}>
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
