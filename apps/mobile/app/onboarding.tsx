import React from "react";
import { View, StyleSheet, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import {
  OnboardingCarousel,
  OnboardingStep,
} from "../components/ui/OnboardingCarousel";
import { hapticSelection } from "../lib/haptics";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "react-i18next";

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const onboardingSteps: OnboardingStep[] = [
    {
      id: "streaming",
      title: t("onboarding.intro.streamingTitle"),
      description: t("onboarding.intro.streamingDescription"),
      image: require("../assets/images/onboarding_streaming.png"),
    },
    {
      id: "sync",
      title: t("onboarding.intro.syncTitle"),
      description: t("onboarding.intro.syncDescription"),
      image: require("../assets/images/onboarding_sync.png"),
    },
    {
      id: "security",
      title: t("onboarding.intro.playbackTitle"),
      description: t("onboarding.intro.playbackDescription"),
      image: require("../assets/images/onboarding_security.png"),
    },
  ];

  const handleComplete = async () => {
    hapticSelection();
    router.replace("/onboarding/setup");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <OnboardingCarousel steps={onboardingSteps} onComplete={handleComplete} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
