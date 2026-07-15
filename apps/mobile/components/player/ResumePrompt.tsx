import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { AppButton } from "../ui/AppButton";
import { uiRadii, uiTypography } from "../ui/designSystem";

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
  const { colors } = useTheme();
  const resumeTitle =
    typeof resumeTimeSeconds === "number" && resumeTimeSeconds > 0
      ? t("player.resume.resumeFrom", {
          defaultValue: `Resume from ${formatResumeTime(resumeTimeSeconds)}?`,
          time: formatResumeTime(resumeTimeSeconds),
        })
      : t("player.resume.title", { defaultValue: "Resume playback?" });

  return (
    <View style={[styles.resumeOverlay, { backgroundColor: colors.scrim }]}>
      <View
        style={[
          styles.resumeBox,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.resumeTitle, { color: colors.text }]}>
          {resumeTitle}
        </Text>
        <Text style={[styles.resumeSub, { color: colors.textSecondary }]}>
          {title}
        </Text>
        <View style={styles.resumeBtns}>
          <AppButton
            label={t("player.resume.startOver", {
              defaultValue: "Start over",
            })}
            variant="secondary"
            onPress={() => onResponse(false)}
          />
          <AppButton
            label={t("player.resume.resume", { defaultValue: "Resume" })}
            icon="play"
            variant="primary"
            onPress={() => onResponse(true)}
          />
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
    borderWidth: 0,
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
});
