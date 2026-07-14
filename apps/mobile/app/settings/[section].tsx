import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { useWindowClass } from "../../hooks/useWindowClass";
import { SettingsExperience } from "../../components/settings/SettingsExperience";
import {
  getSettingsSection,
  isSettingsSectionId,
} from "../../components/settings/settingsSections";

export default function SettingsSectionScreen() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isLarge } = useWindowClass();

  if (!isSettingsSectionId(params.section)) {
    return <Redirect href={"/settings" as never} />;
  }

  const definition = getSettingsSection(params.section);

  return (
    <>
      <Stack.Screen
        options={{
          title: t(definition.titleKey),
          headerShown: !isLarge,
          headerBackTitle: t("library.header.back"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <SettingsExperience section={params.section} />
    </>
  );
}
