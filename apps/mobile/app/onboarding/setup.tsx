import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores/authStore";
import { hapticSelection, hapticSuccess } from "../../lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import { getWebFocusStyle } from "../../components/ui/designSystem";

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
  {
    name: "Torrentio",
    description: "Optional community stream source for playable results.",
    url: "https://torrentio.strem.fun/manifest.json",
  },
];

const SETUP_CHECKS = [
  {
    icon: "albums-outline" as const,
    titleKey: "onboarding.setupCheck.sources",
    fallbackTitle: "Sources & metadata",
    bodyKey: "onboarding.setupCheck.sourcesBody",
    fallbackBody:
      "Install Cinemeta now; add streaming add-ons later from Settings.",
  },
  {
    icon: "desktop-outline" as const,
    titleKey: "onboarding.setupCheck.bridge",
    fallbackTitle: "Desktop bridge",
    bodyKey: "onboarding.setupCheck.bridgeBody",
    fallbackBody:
      "Desktop can prepare torrent/remux playback and share its LAN URL.",
  },
  {
    icon: "cloud-download-outline" as const,
    titleKey: "onboarding.setupCheck.offlineCast",
    fallbackTitle: "Downloads & cast",
    bodyKey: "onboarding.setupCheck.offlineCastBody",
    fallbackBody:
      "Offline and casting become available only when a source supports it.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    titleKey: "onboarding.setupCheck.privacy",
    fallbackTitle: "Privacy",
    bodyKey: "onboarding.setupCheck.privacyBody",
    fallbackBody:
      "Raw stream URLs, magnets, and tokens are not included in diagnostics.",
  },
];

export default function OnboardingSetup() {
  const router = useRouter();
  const theme = useAuthStore((s) => s.theme);
  const setTheme = useAuthStore((s) => s.setTheme);
  const setPendingAddons = useAuthStore((s) => s.setPendingAddons);
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);

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

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          compact && styles.scrollContentCompact,
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t("onboarding.title")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t("onboarding.subtitle")}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.setupHeader}>
            <Ionicons
              name="checkmark-circle-outline"
              size={22}
              color={colors.tint}
            />
            <View style={styles.setupHeaderCopy}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>
                {t("onboarding.setupCheck.title", {
                  defaultValue: "Check setup",
                })}
              </Text>
              <Text
                style={[styles.sectionDesc, { color: colors.textSecondary }]}
              >
                {t("onboarding.setupCheck.subtitle", {
                  defaultValue:
                    "Streamer should feel simple, but playback still depends on your sources and device readiness.",
                })}
              </Text>
            </View>
          </View>
          <View style={styles.setupList}>
            {SETUP_CHECKS.map((item) => (
              <View
                key={item.titleKey}
                style={[
                  styles.setupItem,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.035)"
                      : "rgba(0,0,0,0.025)",
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.setupIcon,
                    { backgroundColor: `${colors.tint}18` },
                  ]}
                >
                  <Ionicons name={item.icon} size={18} color={colors.tint} />
                </View>
                <View style={styles.setupCopy}>
                  <Text style={[styles.setupTitle, { color: colors.text }]}>
                    {t(item.titleKey, { defaultValue: item.fallbackTitle })}
                  </Text>
                  <Text
                    style={[styles.setupBody, { color: colors.textSecondary }]}
                  >
                    {t(item.bodyKey, { defaultValue: item.fallbackBody })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
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
                style={({ pressed, focused }: any) => [
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
                  pressed && { opacity: 0.8 },
                  Platform.OS === "web" &&
                    focused &&
                    getWebFocusStyle(colors.tint),
                ]}
                onPress={() => handleToggleTheme(themeOption)}
                accessibilityRole="radio"
                accessibilityLabel={`${t(`common.themes.${themeOption}`)} theme`}
                accessibilityState={{ checked: theme === themeOption }}
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
              style={({ pressed, focused }: any) => [
                styles.addonCard,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: selectedUrls.includes(addon.url)
                    ? colors.tint
                    : colors.border,
                },
                pressed && { opacity: 0.8 },
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.tint),
              ]}
              onPress={() => handleInstallAddon(addon.url)}
              accessibilityRole="checkbox"
              accessibilityLabel={`${addon.name}. ${addon.description}`}
              accessibilityState={{
                checked: selectedUrls.includes(addon.url),
              }}
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
              accessibilityRole="link"
            >
              {t("onboarding.terms")}
            </Text>{" "}
            {t("onboarding.and")}{" "}
            <Text
              style={[styles.legalLink, { color: colors.tint }]}
              onPress={() => router.push("/privacy")}
              accessibilityRole="link"
            >
              {t("onboarding.privacy")}
            </Text>
            .
          </Text>
        </View>

        <Pressable
          style={({ pressed, focused }: any) => [
            styles.finishBtn,
            pressed && { opacity: 0.82 },
            Platform.OS === "web" && focused && getWebFocusStyle(colors.tint),
          ]}
          onPress={handleFinish}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.finish")}
        >
          <LinearGradient
            colors={isDark ? ["#f2d7ff", "#c5e9d5"] : ["#d8b4fe", "#ffc8dd"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.finishGradient}
          >
            <Text
              style={[
                styles.finishBtnText,
                { color: isDark ? "#2c1738" : "#fff" },
              ]}
            >
              {t("onboarding.finish")}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={isDark ? "#2c1738" : "#fff"}
            />
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    padding: 32,
    paddingTop: 72,
    paddingBottom: 60,
  },
  scrollContentCompact: {
    padding: 18,
    paddingTop: 36,
    paddingBottom: 40,
  },
  header: { marginBottom: 40 },
  title: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 0,
  },
  subtitle: { fontSize: 16, marginTop: 8 },
  section: { marginBottom: 32 },
  sectionLabel: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  sectionDesc: { fontSize: 13, marginBottom: 16 },
  setupHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  setupHeaderCopy: {
    flex: 1,
  },
  setupList: {
    gap: 10,
  },
  setupItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  setupIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  setupCopy: {
    flex: 1,
    gap: 2,
  },
  setupTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  setupBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  themeRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  themeOption: {
    flex: 1,
    minWidth: 96,
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
