import {
  getSettingsSection,
  isSettingsSectionId,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTIONS,
} from "../settingsSections";

describe("settings route contract", () => {
  it("exposes the stable public section ids in navigation order", () => {
    expect(SETTINGS_SECTION_IDS).toEqual([
      "account",
      "playback",
      "downloads",
      "sources",
      "appearance",
      "privacy",
      "about",
      "advanced",
    ]);
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual(
      SETTINGS_SECTION_IDS,
    );
  });

  it("accepts only a single supported route segment", () => {
    expect(isSettingsSectionId("sources")).toBe(true);
    expect(isSettingsSectionId("advanced")).toBe(true);
    expect(isSettingsSectionId("diagnostics")).toBe(false);
    expect(isSettingsSectionId(["sources"])).toBe(false);
    expect(isSettingsSectionId(undefined)).toBe(false);
  });

  it("returns the route metadata for a detail title", () => {
    expect(getSettingsSection("account")).toMatchObject({
      id: "account",
      titleKey: "settings.navigation.account.title",
    });
  });
});
