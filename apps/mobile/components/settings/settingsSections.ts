import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

export const SETTINGS_SECTION_IDS = [
  "account",
  "playback",
  "downloads",
  "sources",
  "appearance",
  "privacy",
  "about",
  "advanced",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export type SettingsSectionDefinition = {
  id: SettingsSectionId;
  icon: ComponentProps<typeof Ionicons>["name"];
  titleKey: string;
  descriptionKey: string;
};

export const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: "account",
    icon: "person-outline",
    titleKey: "settings.navigation.account.title",
    descriptionKey: "settings.navigation.account.description",
  },
  {
    id: "playback",
    icon: "play-circle-outline",
    titleKey: "settings.navigation.playback.title",
    descriptionKey: "settings.navigation.playback.description",
  },
  {
    id: "downloads",
    icon: "cloud-download-outline",
    titleKey: "settings.navigation.downloads.title",
    descriptionKey: "settings.navigation.downloads.description",
  },
  {
    id: "sources",
    icon: "extension-puzzle-outline",
    titleKey: "settings.navigation.sources.title",
    descriptionKey: "settings.navigation.sources.description",
  },
  {
    id: "appearance",
    icon: "contrast-outline",
    titleKey: "settings.navigation.appearance.title",
    descriptionKey: "settings.navigation.appearance.description",
  },
  {
    id: "privacy",
    icon: "shield-checkmark-outline",
    titleKey: "settings.navigation.privacy.title",
    descriptionKey: "settings.navigation.privacy.description",
  },
  {
    id: "about",
    icon: "information-circle-outline",
    titleKey: "settings.navigation.about.title",
    descriptionKey: "settings.navigation.about.description",
  },
  {
    id: "advanced",
    icon: "construct-outline",
    titleKey: "settings.navigation.advanced.title",
    descriptionKey: "settings.navigation.advanced.description",
  },
] as const;

export function isSettingsSectionId(
  value: string | string[] | undefined,
): value is SettingsSectionId {
  return (
    typeof value === "string" &&
    SETTINGS_SECTION_IDS.includes(value as SettingsSectionId)
  );
}

export function getSettingsSection(section: SettingsSectionId) {
  return SETTINGS_SECTIONS.find((candidate) => candidate.id === section)!;
}
