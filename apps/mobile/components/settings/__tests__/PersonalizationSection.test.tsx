import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { PersonalizationSection } from "../PersonalizationSection";
import { usePlayerStore } from "../../../stores/playerStore";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

describe("PersonalizationSection", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      preferredQuality: "auto",
      preferredAudioLang: null,
      preferredSubtitleLang: null,
      autoPlayNext: true,
    });
  });

  it("updates local playback preferences without requiring an account profile", () => {
    const screen = render(<PersonalizationSection />);

    expect(
      screen.getByText("settings.playbackPreferences.quality"),
    ).toBeTruthy();
    expect(screen.getByText("settings.playbackPreferences.audio")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("720P"));
    fireEvent.press(
      screen.getAllByLabelText(
        "settings.playbackPreferences.languages.dutch",
      )[1],
    );
    fireEvent.press(
      screen.getByLabelText("settings.playbackPreferences.autoplay"),
    );

    expect(usePlayerStore.getState()).toMatchObject({
      preferredQuality: "720p",
      preferredSubtitleLang: "nl",
      autoPlayNext: false,
    });
  });
});
