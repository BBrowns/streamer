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

    expect(screen.getByText("Personalization")).toBeTruthy();
    expect(screen.getByText("Local preferences only")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Prefer 720p playback"));
    fireEvent.press(screen.getByLabelText("Prefer Dutch subtitles"));
    fireEvent(
      screen.getByLabelText("Autoplay next episode"),
      "valueChange",
      false,
    );

    expect(usePlayerStore.getState()).toMatchObject({
      preferredQuality: "720p",
      preferredSubtitleLang: "nl",
      autoPlayNext: false,
    });
  });
});
