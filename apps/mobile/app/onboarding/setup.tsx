import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores/authStore";
import { hapticSelection, hapticSuccess } from "../../lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../services/api";

const STARTER_ADDONS = [
  {
    name: "Cinemeta",
    description: "Official movie & TV show metadata provider.",
    url: "https://v3-cinemeta.strem.io/manifest.json",
  },
  {
    name: "OpenSubtitles",
    description: "The world's largest subtitle database.",
    url: "https://opensubtitles-v3.strem.io/manifest.json",
  },
];

export default function OnboardingSetup() {
  const router = useRouter();
  const { theme, setTheme } = useAuthStore();
  const [installed, setInstalled] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);

  const handleToggleTheme = (t: "light" | "dark" | "system") => {
    setTheme(t);
    hapticSelection();
  };

  const handleInstallAddon = async (url: string, name: string) => {
    try {
      setIsInstalling(true);
      // Note: This requires being logged in usually, but during onboarding
      // we might want to just queue them or skip if not supported.
      // For now, we'll just mark them as 'selected' to be installed after login
      // or try to install if the user is already authenticated (unlikely here).
      setInstalled((prev) => [...prev, name]);
      hapticSuccess();
    } finally {
      setIsInstalling(false);
    }
  };

  const handleFinish = async () => {
    try {
      await AsyncStorage.setItem("HAS_SEEN_ONBOARDING", "true");
      hapticSelection();
      router.replace("/login");
    } catch (e) {
      router.replace("/login");
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Personalize</Text>
          <Text style={styles.subtitle}>
            Customize your experience before we begin.
          </Text>
        </View>

        {/* Theme Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Appearance</Text>
          <View style={styles.themeRow}>
            {(["dark", "light", "system"] as const).map((t) => (
              <Pressable
                key={t}
                style={[
                  styles.themeOption,
                  theme === t && styles.themeOptionActive,
                ]}
                onPress={() => handleToggleTheme(t)}
              >
                <Ionicons
                  name={
                    t === "dark" ? "moon" : t === "light" ? "sunny" : "contrast"
                  }
                  size={20}
                  color={theme === t ? "#000" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.themeText,
                    theme === t && styles.themeTextActive,
                  ]}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recommended Add-ons */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Starter Add-ons</Text>
          <Text style={styles.sectionDesc}>
            Highly recommended for metadata and subtitles.
          </Text>
          {STARTER_ADDONS.map((addon) => (
            <Pressable
              key={addon.name}
              style={styles.addonCard}
              onPress={() =>
                !installed.includes(addon.name) &&
                handleInstallAddon(addon.url, addon.name)
              }
            >
              <View style={styles.addonInfo}>
                <Text style={styles.addonName}>{addon.name}</Text>
                <Text style={styles.addonDesc}>{addon.description}</Text>
              </View>
              <View
                style={[
                  styles.installBadge,
                  installed.includes(addon.name) && styles.installBadgeActive,
                ]}
              >
                <Ionicons
                  name={installed.includes(addon.name) ? "checkmark" : "add"}
                  size={16}
                  color={installed.includes(addon.name) ? "#000" : "#00f2ff"}
                />
              </View>
            </Pressable>
          ))}
        </View>

        {/* Legal */}
        <View style={styles.legalSection}>
          <Text style={styles.legalText}>
            By continuing, you agree to our{" "}
            <Text
              style={styles.legalLink}
              onPress={() => router.push("/terms")}
            >
              Terms
            </Text>{" "}
            and{" "}
            <Text
              style={styles.legalLink}
              onPress={() => router.push("/privacy")}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>

        <Pressable style={styles.finishBtn} onPress={handleFinish}>
          <LinearGradient
            colors={["#00f2ff", "#00d1ff"]}
            style={styles.finishGradient}
          >
            <Text style={styles.finishBtnText}>Finish & Sign In</Text>
            <Ionicons name="arrow-forward" size={18} color="#000" />
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050614" },
  scrollContent: { padding: 32, paddingTop: 100, paddingBottom: 60 },
  header: { marginBottom: 40 },
  title: {
    color: "#f8fafc",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1,
  },
  subtitle: { color: "#94a3b8", fontSize: 16, marginTop: 8 },
  section: { marginBottom: 32 },
  sectionLabel: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  sectionDesc: { color: "#64748b", fontSize: 13, marginBottom: 16 },
  themeRow: { flexDirection: "row", gap: 12 },
  themeOption: {
    flex: 1,
    height: 80,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  themeOptionActive: { backgroundColor: "#00f2ff", borderColor: "#00f2ff" },
  themeText: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  themeTextActive: { color: "#000" },
  addonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  addonInfo: { flex: 1 },
  addonName: { color: "#f8fafc", fontSize: 15, fontWeight: "700" },
  addonDesc: { color: "#64748b", fontSize: 12, marginTop: 2 },
  installBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 242, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  installBadgeActive: { backgroundColor: "#00f2ff" },
  legalSection: { marginTop: 20, marginBottom: 40 },
  legalText: {
    color: "#475569",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  legalLink: { color: "#00f2ff", fontWeight: "700" },
  finishBtn: { height: 60, borderRadius: 20, overflow: "hidden" },
  finishGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  finishBtnText: {
    color: "#000",
    fontSize: 17,
    fontWeight: "900",
    textTransform: "uppercase",
  },
});
