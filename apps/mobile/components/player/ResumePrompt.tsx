import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";

interface ResumePromptProps {
  onResponse: (resume: boolean) => void;
  title: string;
}

export const ResumePrompt: React.FC<ResumePromptProps> = ({
  onResponse,
  title,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.resumeOverlay,
        {
          backgroundColor: isDark
            ? "rgba(0,0,0,0.85)"
            : "rgba(255,255,255,0.85)",
        },
      ]}
    >
      <View
        style={[
          styles.resumeBox,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.resumeTitle, { color: colors.text }]}>
          {t("player.resume.title")}
        </Text>
        <Text style={[styles.resumeSub, { color: colors.textSecondary }]}>
          {title}
        </Text>
        <View style={styles.resumeBtns}>
          <Pressable
            style={[
              styles.resumeBtnGhost,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.05)",
              },
            ]}
            onPress={() => onResponse(false)}
          >
            <Text style={[styles.resumeBtnGhostText, { color: colors.text }]}>
              {t("player.resume.startOver")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.resumeBtnPrimary, { backgroundColor: colors.tint }]}
            onPress={() => onResponse(true)}
          >
            <Text
              style={[
                styles.resumeBtnPrimaryText,
                { color: isDark ? "#000" : "#fff" },
              ]}
            >
              {t("player.resume.resume")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  resumeOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  resumeBox: {
    padding: 30,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    maxWidth: 340,
  },
  resumeTitle: {
    fontSize: 20,
    fontWeight: "bold",
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
  resumeBtnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  resumeBtnGhostText: {
    fontWeight: "600",
  },
  resumeBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  resumeBtnPrimaryText: {
    fontWeight: "bold",
  },
});
