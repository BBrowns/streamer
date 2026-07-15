import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { LanguageSection, normalizeSettingsLanguage } from "../LanguageSection";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

describe("settings language selection", () => {
  it("normalizes regional and underscore locale variants", () => {
    expect(normalizeSettingsLanguage("en-US")).toBe("en");
    expect(normalizeSettingsLanguage("nl_NL")).toBe("nl");
    expect(normalizeSettingsLanguage("ES-mx")).toBe("es");
  });

  it("falls back to English for unsupported or missing locales", () => {
    expect(normalizeSettingsLanguage("fr-FR")).toBe("en");
    expect(normalizeSettingsLanguage(undefined)).toBe("en");
  });

  it("renders scalable radio rows and persists the selected base locale", async () => {
    const screen = render(<LanguageSection />);

    expect(
      screen.getByTestId("settings-language-en").props.accessibilityState,
    ).toMatchObject({ checked: true });

    fireEvent.press(screen.getByTestId("settings-language-es"));
    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith("user-language", "es");
    });
  });
});
