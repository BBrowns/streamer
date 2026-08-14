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
  it("uses the cinema-dark sheet regardless of the surrounding application theme", async () => {
    const onSelectPlaybackRate = jest.fn();
    const onSelectSubtitleMode = jest.fn();
    const onSelectSubtitleTextSize = jest.fn();
    const onSelectSubtitleSyncOffset = jest.fn();
    const onSelectSubtitleBackgroundOpacity = jest.fn();
    const onSelectSubtitleVerticalPosition = jest.fn();
    const onSelectSubtitleFontFamily = jest.fn();
    const onResetSubtitleStyle = jest.fn();
    const screen = await render(
      <PlayerSettingsModal
        visible
        onClose={jest.fn()}
        audioTracks={[]}
        subtitles={[]}
        onSelectAudio={jest.fn()}
        onSelectSubtitle={jest.fn()}
        playbackRate={1}
        onSelectPlaybackRate={onSelectPlaybackRate}
        subtitleMode="auto"
        onSelectSubtitleMode={onSelectSubtitleMode}
        subtitleAccessibility="neutral"
        onSelectSubtitleAccessibility={jest.fn()}
        subtitleTextSize="medium"
        onSelectSubtitleTextSize={onSelectSubtitleTextSize}
        subtitleBackground="shadow"
        onSelectSubtitleBackground={jest.fn()}
        subtitleBackgroundOpacity={0.78}
        onSelectSubtitleBackgroundOpacity={onSelectSubtitleBackgroundOpacity}
        subtitleVerticalPosition="low"
        onSelectSubtitleVerticalPosition={onSelectSubtitleVerticalPosition}
        subtitleFontFamily="system"
        onSelectSubtitleFontFamily={onSelectSubtitleFontFamily}
        subtitleSyncOffsetSeconds={0}
        onSelectSubtitleSyncOffset={onSelectSubtitleSyncOffset}
        onResetSubtitleStyle={onResetSubtitleStyle}
        diagnostics={[]}
      />,
    );

    const sheetStyle = StyleSheet.flatten(
      screen.getByTestId("player-settings-sheet").props.style,
    );
    expect(sheetStyle.backgroundColor).toBe(playerChrome.surfaceStrong);
    expect(sheetStyle.borderColor).toBe(playerChrome.border);

    await fireEvent.press(screen.getByLabelText("player.settings.speed: 1.5x"));
    expect(onSelectPlaybackRate).toHaveBeenCalledWith(1.5);
    await fireEvent.press(screen.getByLabelText("Automatic behavior: Always"));
    await fireEvent.press(screen.getByLabelText("Text size: L"));
    await fireEvent.press(screen.getByLabelText("Background opacity: 50%"));
    await fireEvent.press(screen.getByLabelText("Vertical position: High"));
    await fireEvent.press(screen.getByLabelText("Font: Serif"));
    await fireEvent.press(screen.getByLabelText("Subtitle sync: +0.5s"));
    await fireEvent.press(screen.getByLabelText("Reset subtitle style"));
    expect(onSelectSubtitleMode).toHaveBeenCalledWith("always");
    expect(onSelectSubtitleTextSize).toHaveBeenCalledWith("large");
    expect(onSelectSubtitleBackgroundOpacity).toHaveBeenCalledWith(0.5);
    expect(onSelectSubtitleVerticalPosition).toHaveBeenCalledWith("high");
    expect(onSelectSubtitleFontFamily).toHaveBeenCalledWith("serif");
    expect(onSelectSubtitleSyncOffset).toHaveBeenCalledWith(0.5);
    expect(onResetSubtitleStyle).toHaveBeenCalledTimes(1);
  });
});
