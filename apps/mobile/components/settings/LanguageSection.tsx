import React from "react";
import { View, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "../ui/SegmentedControl";

export function LanguageSection() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  const languages = [
    { label: "English", value: "en", emoji: "🇺🇸" },
    { label: "Español", value: "es", emoji: "🇪🇸" },
    { label: "Nederlands", value: "nl", emoji: "🇳🇱" },
  ];

  const handleLanguageChange = async (lang: string) => {
    await i18n.changeLanguage(lang);
    await AsyncStorage.setItem("user-language", lang);
  };

  return (
    <View style={styles.section}>
      <SegmentedControl
        options={languages}
        value={currentLang}
        onChange={handleLanguageChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
});
