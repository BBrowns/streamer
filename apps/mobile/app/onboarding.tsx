import React from "react";
import { View, StyleSheet, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  OnboardingCarousel,
  OnboardingStep,
} from "../components/ui/OnboardingCarousel";
import { hapticSelection } from "../lib/haptics";

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "streaming",
    title: "Soft Cinema",
    description:
      "Browse your add-ons, sources, and playback devices from one calm, cinematic space.",
    image: require("../assets/images/onboarding_streaming.png"),
    colors: ["#f2d7ff", "#c5e9d5"],
  },
  {
    id: "sync",
    title: "Across Screens",
    description:
      "Start on desktop, continue on iPhone or Android, and keep your library close.",
    image: require("../assets/images/onboarding_sync.png"),
    colors: ["#d9e7ff", "#ffd8e7"],
  },
  {
    id: "security",
    title: "Sources First",
    description:
      "Set up Cinemeta now, add streaming sources next, and keep paid services optional.",
    image: require("../assets/images/onboarding_security.png"),
    colors: ["#ffe4c7", "#d8f6e4"],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();

  const handleComplete = async () => {
    hapticSelection();
    router.replace("/onboarding/setup");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
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
    backgroundColor: "#050614",
  },
});
