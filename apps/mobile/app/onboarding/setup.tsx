import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores/authStore";
import { hapticSelection, hapticSuccess } from "../../lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "react-i18next";
import {
  getWebFocusStyle,
  uiRadii,
  uiTypography,
} from "../../components/ui/designSystem";
import { useWindowClass } from "../../hooks/useWindowClass";

const STARTER_ADDONS = [
  {
    name: "Cinemeta",
    descriptionKey: "onboarding.starterAddons.cinemeta",
    url: "https://v3-cinemeta.strem.io/manifest.json",
  },
  {
    name: "OpenSubtitles",
    descriptionKey: "onboarding.starterAddons.openSubtitles",
    url: "https://opensubtitles-v3.strem.io/manifest.json",
  },
  {
    name: "Torrentio",
    descriptionKey: "onboarding.starterAddons.torrentio",
    url: "https://torrentio.strem.fun/manifest.json",
  },
];

const SETUP_CHECKS = [
  {
    icon: "albums-outline" as const,
    titleKey: "onboarding.setupCheck.sources",
    fallbackTitle: "Catalogs & add-ons",
    bodyKey: "onboarding.setupCheck.sourcesBody",
    fallbackBody:
      "Start with a rich catalog now and add playback options whenever you are ready.",
  },
  {
    icon: "desktop-outline" as const,
    titleKey: "onboarding.setupCheck.bridge",
    fallbackTitle: "Playback on every screen",
    bodyKey: "onboarding.setupCheck.bridgeBody",
    fallbackBody:
      "The desktop companion quietly prepares sources that need a little extra help.",
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
    fallbackBody: "Diagnostic reports hide sensitive connection details.",
  },
];

export default function OnboardingSetup() {
  const router = useRouter();
  const theme = useAuthStore((s) => s.theme);
  const setTheme = useAuthStore((s) => s.setTheme);
  const setPendingAddons = useAuthStore((s) => s.setPendingAddons);
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { isCompact: compact } = useWindowClass();
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
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: "transparent",
                  },
                ]}
              >
                <View
                  style={[
                    styles.setupIcon,
                    { backgroundColor: colors.surfaceElevated },
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
                    backgroundColor: colors.surfaceSubtle,
                    borderColor:
                      theme === themeOption ? colors.tint : "transparent",
                  },
                  theme === themeOption && {
                    backgroundColor: `${colors.tint}15`,
                  },
                  pressed && { opacity: 0.8 },
                  Platform.OS === "web" &&
                    focused &&
                    getWebFocusStyle(colors.focus),
                ]}
                onPress={() => handleToggleTheme(themeOption)}
                accessibilityRole="radio"
                accessibilityLabel={t("onboarding.themeA11y", {
                  theme: t(`common.themes.${themeOption}`),
                })}
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
                  backgroundColor: colors.card,
                  borderColor: selectedUrls.includes(addon.url)
                    ? colors.tint
                    : "transparent",
                },
                pressed && { opacity: 0.8 },
                Platform.OS === "web" &&
                  focused &&
                  getWebFocusStyle(colors.focus),
              ]}
              onPress={() => handleInstallAddon(addon.url)}
              accessibilityRole="checkbox"
              accessibilityLabel={t("onboarding.addonA11y", {
                name: addon.name,
                description: t(addon.descriptionKey),
              })}
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
                  {t(addon.descriptionKey)}
                </Text>
              </View>
              <View
                style={[
                  styles.installBadge,
                  {
                    backgroundColor: selectedUrls.includes(addon.url)
                      ? colors.tint
                      : colors.surfaceElevated,
                  },
                ]}
              >
                <Ionicons
                  name={selectedUrls.includes(addon.url) ? "checkmark" : "add"}
                  size={16}
                  color={
                    selectedUrls.includes(addon.url)
                      ? colors.onTint
                      : colors.tint
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
            Platform.OS === "web" && focused && getWebFocusStyle(colors.focus),
          ]}
          onPress={handleFinish}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.finish")}
        >
          <LinearGradient
            colors={[colors.primary, colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.finishGradient}
          >
            <Text style={[styles.finishBtnText, { color: colors.onPrimary }]}>
              {t("onboarding.finish")}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
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
    ...uiTypography.headline,
  },
  subtitle: { ...uiTypography.body, fontSize: 16, marginTop: 8 },
  section: { marginBottom: 32 },
  sectionLabel: {
    ...uiTypography.title,
    fontSize: 20,
    lineHeight: 26,
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
    borderRadius: uiRadii.card,
    borderWidth: 0,
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
    borderRadius: uiRadii.card,
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
    borderRadius: uiRadii.card,
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
  finishBtn: { height: 52, borderRadius: uiRadii.control, overflow: "hidden" },
  finishGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  finishBtnText: {
    ...uiTypography.control,
    fontSize: 16,
  },
});
