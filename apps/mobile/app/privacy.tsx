import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { LegalDocumentScreen } from "../components/legal/LegalDocumentScreen";
import { useTheme } from "../hooks/useTheme";
import { useWindowClass } from "../hooks/useWindowClass";

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isCompact } = useWindowClass();

  return (
    <>
      <Stack.Screen
        options={{
          title: t("legal.privacyTitle"),
          headerShown: isCompact,
          headerBackTitle: t("navigation.back"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <LegalDocumentScreen
        testID="privacy-screen"
        title={t("legal.privacyTitle")}
        lastUpdated={t("legal.lastUpdated", { date: t("legal.updatedDate") })}
        sections={[1, 2, 3, 4].map((section) => ({
          title: t(`legal.sections.privacy.${section}`),
          body: t(`legal.bodies.privacy.${section}`),
        }))}
      />
    </>
  );
}
