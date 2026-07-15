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
      preferredQualities: ["2160p", "1080p", "720p", "480p"],
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

    fireEvent.press(
      screen.getByLabelText("settings.playbackPreferences.qualityOptions.720"),
    );
    fireEvent.press(
      screen.getByLabelText("settings.playbackPreferences.qualityOptions.480"),
    );
    fireEvent.press(
      screen.getAllByLabelText(
        "settings.playbackPreferences.languages.dutch",
      )[1],
    );
    fireEvent.press(
      screen.getByLabelText("settings.playbackPreferences.autoplay"),
    );

    expect(usePlayerStore.getState()).toMatchObject({
      preferredQualities: ["2160p", "1080p"],
      preferredSubtitleLang: "nl",
      autoPlayNext: false,
    });
  });

  it("keeps at least one playback quality selected", () => {
    usePlayerStore.setState({ preferredQualities: ["1080p"] });
    const screen = render(<PersonalizationSection />);
    const onlyQuality = screen.getByLabelText(
      "settings.playbackPreferences.qualityOptions.1080",
    );

    expect(onlyQuality.props.accessibilityState).toMatchObject({
      checked: true,
      disabled: true,
    });
    fireEvent.press(onlyQuality);

    expect(usePlayerStore.getState().preferredQualities).toEqual(["1080p"]);
  });
});
