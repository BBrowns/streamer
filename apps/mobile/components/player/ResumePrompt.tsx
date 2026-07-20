import React from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import {
  getWebFocusStyle,
  uiRadii,
  uiTouchTarget,
  uiTypography,
} from "../ui/designSystem";
import { playerChrome } from "./playerChrome";

interface ResumePromptProps {
  onResponse: (resume: boolean) => void;
  title: string;
  resumeTimeSeconds?: number | null;
}

export const ResumePrompt: React.FC<ResumePromptProps> = ({
  onResponse,
  title,
  resumeTimeSeconds = null,
}) => {
  const { t } = useTranslation();
  const resumeTitle =
    typeof resumeTimeSeconds === "number" && resumeTimeSeconds > 0
      ? t("player.resume.resumeFrom", {
          defaultValue: `Resume from ${formatResumeTime(resumeTimeSeconds)}?`,
          time: formatResumeTime(resumeTimeSeconds),
        })
      : t("player.resume.title", { defaultValue: "Resume playback?" });

  return (
    <View
      style={[styles.resumeOverlay, { backgroundColor: playerChrome.scrim }]}
    >
      <View
        testID="player-resume-prompt"
        style={[
          styles.resumeBox,
          {
            backgroundColor: playerChrome.surfaceStrong,
            borderColor: playerChrome.border,
          },
        ]}
      >
        <Text style={[styles.resumeTitle, { color: playerChrome.text }]}>
          {resumeTitle}
        </Text>
        <Text style={[styles.resumeSub, { color: playerChrome.textMuted }]}>
          {title}
        </Text>
        <View style={styles.resumeBtns}>
          <Pressable
            style={({ pressed, focused }: any) => [
              styles.secondaryButton,
              {
                backgroundColor: playerChrome.surface,
                borderColor: playerChrome.border,
                opacity: pressed ? 0.78 : 1,
              },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(playerChrome.focus),
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("player.resume.startOver", {
              defaultValue: "Start over",
            })}
            onPress={() => onResponse(false)}
          >
            <Text style={[styles.buttonText, { color: playerChrome.text }]}>
              {t("player.resume.startOver", {
                defaultValue: "Start over",
              })}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed, focused }: any) => [
              styles.primaryButton,
              {
                backgroundColor: playerChrome.text,
                opacity: pressed ? 0.82 : 1,
              },
              Platform.OS === "web" &&
                focused &&
                getWebFocusStyle(playerChrome.focus),
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("player.resume.resume", {
              defaultValue: "Resume",
            })}
            onPress={() => onResponse(true)}
          >
            <Text style={[styles.buttonText, { color: playerChrome.canvas }]}>
              {t("player.resume.resume", { defaultValue: "Resume" })}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

function formatResumeTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const paddedSeconds = String(remainingSeconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

const styles = StyleSheet.create({
  resumeOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  resumeBox: {
    padding: 30,
    borderRadius: uiRadii.sheet,
    borderWidth: 1,
    alignItems: "center",
    maxWidth: 340,
  },
  resumeTitle: {
    ...uiTypography.title,
    marginBottom: 8,
  },
  resumeSub: {
    fontSize: 15,
    marginBottom: 24,
    textAlign: "center",
  },
  resumeBtns: {
    flexDirection: "row",
    gap: 12,
  },
  primaryButton: {
    minWidth: 112,
    minHeight: uiTouchTarget,
    paddingHorizontal: 16,
    borderRadius: uiRadii.control,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    minWidth: 112,
    minHeight: uiTouchTarget,
    paddingHorizontal: 16,
    borderRadius: uiRadii.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    ...uiTypography.control,
  },
});
