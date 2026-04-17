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
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";

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
  const theme = useAuthStore((s) => s.theme);
  const setTheme = useAuthStore((s) => s.setTheme);
  const setPendingAddons = useAuthStore((s) => s.setPendingAddons);
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);

  const handleToggleTheme = (t: "light" | "dark" | "system") => {
    setTheme(t);
    hapticSelection();
  };

  const handleInstallAddon = (url: string) => {
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
    hapticSelection();
  };

  const handleFinish = async () => {
    try {
      // Save pending addons to global store before navigating
      setPendingAddons(selectedUrls);

      await AsyncStorage.setItem("HAS_SEEN_ONBOARDING", "true");
      hapticSuccess();
      router.replace("/login");
    } catch (e) {
      router.replace("/login");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("onboarding.title")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("onboarding.subtitle")}
          </Text>
        </View>

        {/* Theme Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            {t("onboarding.appearance")}
          </Text>
          <View style={styles.themeRow}>
            {(["dark", "light", "system"] as const).map((themeOption) => (
              <Pressable
                key={themeOption}
                style={[
                  styles.themeOption,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.04)",
                    borderColor:
                      theme === themeOption ? colors.tint : colors.border,
                  },
                  theme === themeOption && {
                    backgroundColor: `${colors.tint}15`,
                  },
                ]}
                onPress={() => handleToggleTheme(themeOption)}
              >
                <Ionicons
                  name={
                    themeOption === "dark"
                      ? "moon"
                      : themeOption === "light"
                        ? "sunny"
                        : "contrast"
                  }
                  size={20}
                  color={
                    theme === themeOption ? colors.tint : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.themeText,
                    {
                      color:
                        theme === themeOption
                          ? colors.text
                          : colors.textSecondary,
                    },
                    theme === themeOption && styles.themeTextActive,
                  ]}
                >
                  {t(`common.themes.${themeOption}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recommended Add-ons */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            {t("onboarding.addonsTitle")}
          </Text>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t("onboarding.addonsSubtitle")}
          </Text>
          {STARTER_ADDONS.map((addon) => (
            <Pressable
              key={addon.name}
              style={[
                styles.addonCard,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: selectedUrls.includes(addon.url)
                    ? colors.tint
                    : colors.border,
                },
              ]}
              onPress={() => handleInstallAddon(addon.url)}
            >
              <View style={styles.addonInfo}>
                <Text style={[styles.addonName, { color: colors.text }]}>
                  {addon.name}
                </Text>
                <Text
                  style={[styles.addonDesc, { color: colors.textSecondary }]}
                >
                  {addon.description}
                </Text>
              </View>
              <View
                style={[
                  styles.installBadge,
                  {
                    backgroundColor: selectedUrls.includes(addon.url)
                      ? colors.tint
                      : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                  },
                ]}
              >
                <Ionicons
                  name={selectedUrls.includes(addon.url) ? "checkmark" : "add"}
                  size={16}
                  color={
                    selectedUrls.includes(addon.url) ? "#fff" : colors.tint
                  }
                />
              </View>
            </Pressable>
          ))}
        </View>

        {/* Legal */}
        <View style={styles.legalSection}>
          <Text style={[styles.legalText, { color: colors.textSecondary }]}>
            {t("onboarding.legalAgreement")}{" "}
            <Text
              style={[styles.legalLink, { color: colors.tint }]}
              onPress={() => router.push("/terms")}
            >
              {t("onboarding.terms")}
            </Text>{" "}
            {t("onboarding.and")}{" "}
            <Text
              style={[styles.legalLink, { color: colors.tint }]}
              onPress={() => router.push("/privacy")}
            >
              {t("onboarding.privacy")}
            </Text>
            .
          </Text>
        </View>

        <Pressable style={styles.finishBtn} onPress={handleFinish}>
          <LinearGradient
            colors={isDark ? ["#00f2ff", "#00d1ff"] : ["#6366f1", "#4f46e5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.finishGradient}
          >
            <Text
              style={[
                styles.finishBtnText,
                { color: isDark ? "#000" : "#fff" },
              ]}
            >
              {t("onboarding.finish")}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={isDark ? "#000" : "#fff"}
            />
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 32, paddingTop: 100, paddingBottom: 60 },
  header: { marginBottom: 40 },
  title: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  subtitle: { fontSize: 16, marginTop: 8 },
  section: { marginBottom: 32 },
  sectionLabel: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  sectionDesc: { fontSize: 13, marginBottom: 16 },
  themeRow: { flexDirection: "row", gap: 12 },
  themeOption: {
    flex: 1,
    height: 85,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
  },
  themeText: { fontSize: 13, fontWeight: "700" },
  themeTextActive: { fontWeight: "800" },
  addonCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  addonInfo: { flex: 1 },
  addonName: { fontSize: 16, fontWeight: "700" },
  addonDesc: { fontSize: 13, marginTop: 2 },
  installBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  legalSection: { marginTop: 20, marginBottom: 40 },
  legalText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  legalLink: { fontWeight: "700" },
  finishBtn: { height: 64, borderRadius: 24, overflow: "hidden" },
  finishGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  finishBtnText: {
    fontSize: 17,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
