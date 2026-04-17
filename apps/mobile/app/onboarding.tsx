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
    title: "Premium Experience",
    description:
      "Stream your favorite content in high definition with a modern, holographic interface designed for true cinephiles.",
    image: require("../assets/images/onboarding_streaming.png"),
    colors: ["#1e1b4b", "#312e81"],
  },
  {
    id: "sync",
    title: "Global Sync",
    description:
      "Your library and watch progress stay in perfect sync across all your devices in real-time. Start on your TV, finish on your phone.",
    image: require("../assets/images/onboarding_sync.png"),
    colors: ["#0f172a", "#1e293b"],
  },
  {
    id: "security",
    title: "Secure & Private",
    description:
      "Protect your account with mandatory email activation and biometric unlocking. Your data is your business, and we keep it that way.",
    image: require("../assets/images/onboarding_security.png"),
    colors: ["#020617", "#0f172a"],
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
