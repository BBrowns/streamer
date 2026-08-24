import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { PlayerSettingsModal } from "../PlayerSettingsModal";
import { playerChrome } from "../playerChrome";

let mockPlayerLocale: "keys" | "nl" = "keys";
const mockEnglishPlayerSettings: Record<string, string> = {
  "player.settings.playback": "Playback",
  "player.settings.audioTab": "Audio",
  "player.settings.subtitles": "Subtitles",
  "player.settings.quality": "Quality",
  "player.settings.auto": "Auto",
  "player.settings.always": "Always",
  "player.settings.small": "Small",
  "player.settings.medium": "Medium",
  "player.settings.large": "Large",
  "player.settings.positionHigh": "High",
  "player.settings.fontSerif": "Serif",
};
const mockDutchPlayerSettings: Record<string, string> = {
  "player.settings.playback": "Afspelen",
  "player.settings.audioTab": "Audio",
  "player.settings.subtitles": "Ondertiteling",
  "player.settings.quality": "Kwaliteit",
  "player.settings.auto": "Automatisch",
  "player.settings.subtitleMode": "Ondertitelingsmodus",
  "player.settings.always": "Altijd",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      mockPlayerLocale === "nl"
        ? (mockDutchPlayerSettings[key] ?? options?.defaultValue ?? key)
        : (mockEnglishPlayerSettings[key] ?? options?.defaultValue ?? key),
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

describe("PlayerSettingsModal", () => {
  beforeEach(() => {
    mockPlayerLocale = "keys";
  });

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
        preferredQualities={["2160p", "1080p", "720p", "480p"]}
        onSelectPreferredQualities={jest.fn()}
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

    await fireEvent.press(screen.getByLabelText("Playback"));
    await fireEvent.press(screen.getByLabelText("player.settings.speed: 1.5x"));
    expect(onSelectPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(screen.getByLabelText("player.settings.speed: 0.75x")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Subtitles"));
    await fireEvent.press(screen.getByLabelText("Automatic behavior: Always"));
    await fireEvent.press(screen.getByLabelText("Text size: Large"));
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

  it("presents the quality allowlist as Auto and exact quality tiles", async () => {
    const onSelectPreferredQualities = jest.fn();
    const screen = await render(
      <PlayerSettingsModal
        visible
        onClose={jest.fn()}
        audioTracks={[]}
        subtitles={[]}
        onSelectAudio={jest.fn()}
        onSelectSubtitle={jest.fn()}
        playbackRate={1}
        onSelectPlaybackRate={jest.fn()}
        preferredQualities={["1080p", "720p", "480p"]}
        onSelectPreferredQualities={onSelectPreferredQualities}
        subtitleMode="auto"
        onSelectSubtitleMode={jest.fn()}
        subtitleAccessibility="neutral"
        onSelectSubtitleAccessibility={jest.fn()}
        subtitleTextSize="medium"
        onSelectSubtitleTextSize={jest.fn()}
        subtitleBackground="shadow"
        onSelectSubtitleBackground={jest.fn()}
        subtitleBackgroundOpacity={0.78}
        onSelectSubtitleBackgroundOpacity={jest.fn()}
        subtitleVerticalPosition="low"
        onSelectSubtitleVerticalPosition={jest.fn()}
        subtitleFontFamily="system"
        onSelectSubtitleFontFamily={jest.fn()}
        subtitleSyncOffsetSeconds={0}
        onSelectSubtitleSyncOffset={jest.fn()}
        onResetSubtitleStyle={jest.fn()}
        diagnostics={[]}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Quality: Auto"));
    expect(onSelectPreferredQualities).toHaveBeenCalledWith([
      "2160p",
      "1080p",
      "720p",
      "480p",
    ]);
  });

  it("localizes tabs, quality, and subtitle preference values", async () => {
    mockPlayerLocale = "nl";
    const screen = await render(
      <PlayerSettingsModal
        visible
        onClose={jest.fn()}
        audioTracks={[]}
        subtitles={[]}
        onSelectAudio={jest.fn()}
        onSelectSubtitle={jest.fn()}
        playbackRate={1}
        onSelectPlaybackRate={jest.fn()}
        preferredQualities={["2160p", "1080p", "720p", "480p"]}
        onSelectPreferredQualities={jest.fn()}
        subtitleMode="auto"
        onSelectSubtitleMode={jest.fn()}
        subtitleAccessibility="neutral"
        onSelectSubtitleAccessibility={jest.fn()}
        subtitleTextSize="medium"
        onSelectSubtitleTextSize={jest.fn()}
        subtitleBackground="shadow"
        onSelectSubtitleBackground={jest.fn()}
        subtitleBackgroundOpacity={0.78}
        onSelectSubtitleBackgroundOpacity={jest.fn()}
        subtitleVerticalPosition="low"
        onSelectSubtitleVerticalPosition={jest.fn()}
        subtitleFontFamily="system"
        onSelectSubtitleFontFamily={jest.fn()}
        subtitleSyncOffsetSeconds={0}
        onSelectSubtitleSyncOffset={jest.fn()}
        onResetSubtitleStyle={jest.fn()}
        diagnostics={[]}
      />,
    );

    expect(screen.getByLabelText("Afspelen")).toBeTruthy();
    expect(screen.getByLabelText("Audio")).toBeTruthy();
    expect(screen.getByLabelText("Ondertiteling")).toBeTruthy();
    expect(screen.getByLabelText("Kwaliteit: Automatisch")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Ondertiteling"));
    expect(screen.getByLabelText("Ondertitelingsmodus: Altijd")).toBeTruthy();
  });
});
