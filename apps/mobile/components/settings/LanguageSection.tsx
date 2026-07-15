import React from "react";
import { StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { SettingsRadioRow, SettingsRowGroup } from "./SettingsRows";

const SUPPORTED_LANGUAGES = ["en", "es", "nl"] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function normalizeSettingsLanguage(language?: string | null) {
  const baseLanguage = String(language ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];

  return SUPPORTED_LANGUAGES.includes(baseLanguage as SupportedLanguage)
    ? (baseLanguage as SupportedLanguage)
    : "en";
}

export function LanguageSection() {
  const { i18n, t } = useTranslation();
  const currentLang = normalizeSettingsLanguage(
    i18n.resolvedLanguage ?? i18n.language,
  );

  const languages = [
    { label: "English", value: "en" as const },
    { label: "Español", value: "es" as const },
    { label: "Nederlands", value: "nl" as const },
  ] satisfies Array<{ label: string; value: SupportedLanguage }>;

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    await i18n.changeLanguage(lang);
    await AsyncStorage.setItem("user-language", lang);
  };

  return (
    <View
      style={styles.section}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("settings.language")}
    >
      <SettingsRowGroup>
        {languages.map((language) => (
          <SettingsRadioRow
            key={language.value}
            testID={`settings-language-${language.value}`}
            title={language.label}
            selected={currentLang === language.value}
            onPress={() => void handleLanguageChange(language.value)}
          />
        ))}
      </SettingsRowGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
});
