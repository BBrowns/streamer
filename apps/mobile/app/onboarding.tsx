import React from "react";
import { View, StyleSheet, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import {
  OnboardingCarousel,
  OnboardingStep,
} from "../components/ui/OnboardingCarousel";
import { hapticSelection } from "../lib/haptics";
import { useTheme } from "../hooks/useTheme";

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "streaming",
    title: "Soft Cinema",
    description:
      "Browse your add-ons, sources, and playback devices from one calm, cinematic space.",
    image: require("../assets/images/onboarding_streaming.png"),
  },
  {
    id: "sync",
    title: "Across Screens",
    description:
      "Start on desktop, continue on iPhone or Android, and keep your library close.",
    image: require("../assets/images/onboarding_sync.png"),
  },
  {
    id: "security",
    title: "Sources First",
    description:
      "Set up Cinemeta now, add streaming sources next, and keep paid services optional.",
    image: require("../assets/images/onboarding_security.png"),
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const handleComplete = async () => {
    hapticSelection();
    router.replace("/onboarding/setup");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <OnboardingCarousel
        steps={ONBOARDING_STEPS}
        onComplete={handleComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
