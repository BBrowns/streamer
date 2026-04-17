import { Platform } from "react-native";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "../locales/en.json";
import es from "../locales/es.json";
import nl from "../locales/nl.json";

const resources = {
  en: { translation: en },
  es: { translation: es },
  nl: { translation: nl },
};

const LANGUAGE_KEY = "user-language";

const initI18n = async () => {
  let savedLanguage = null;

  // Guard: AsyncStorage on Web requires 'window' (browser environment).
  // Expo Router/Metro may execute this in Node during bundling/SSR.
  const isWeb = Platform.OS === "web";
  const isServer = isWeb && typeof window === "undefined";

  if (!isServer) {
    try {
      savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    } catch (e) {
      if (__DEV__) console.warn("[i18n] Failed to load saved language:", e);
    }
  }

  if (!savedLanguage && !isServer) {
    const locale = Localization.getLocales()[0];
    savedLanguage = locale?.languageCode || "en";
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: savedLanguage || "en",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });
};

// Only run top-level initialization if NOT in a server-side context for web
if (Platform.OS !== "web" || typeof window !== "undefined") {
  initI18n();
}

export default i18n;
