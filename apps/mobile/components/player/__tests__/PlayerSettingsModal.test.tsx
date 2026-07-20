import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { PlayerSettingsModal } from "../PlayerSettingsModal";
import { playerChrome } from "../playerChrome";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

describe("PlayerSettingsModal", () => {
  it("uses the cinema-dark sheet regardless of the surrounding application theme", () => {
    const onSelectPlaybackRate = jest.fn();
    const screen = render(
      <PlayerSettingsModal
        visible
        onClose={jest.fn()}
        audioTracks={[]}
        subtitles={[]}
        onSelectAudio={jest.fn()}
        onSelectSubtitle={jest.fn()}
        playbackRate={1}
        onSelectPlaybackRate={onSelectPlaybackRate}
      />,
    );

    const sheetStyle = StyleSheet.flatten(
      screen.getByTestId("player-settings-sheet").props.style,
    );
    expect(sheetStyle.backgroundColor).toBe(playerChrome.surfaceStrong);
    expect(sheetStyle.borderColor).toBe(playerChrome.border);

    fireEvent.press(screen.getByLabelText("player.settings.speed: 1.5x"));
    expect(onSelectPlaybackRate).toHaveBeenCalledWith(1.5);
  });
});
