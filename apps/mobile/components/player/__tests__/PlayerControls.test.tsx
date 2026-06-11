import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { PlayerControls } from "../PlayerControls";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      tint: "#a78bfa",
      error: "#ff9ba6",
      success: "#a7e8bd",
      warning: "#ffd9a8",
      card: "rgba(255,255,255,0.08)",
      text: "#ffffff",
      textSecondary: "#c7bfd5",
      border: "rgba(255,255,255,0.16)",
    },
  }),
}));

describe("PlayerControls", () => {
  const createPlayer = () =>
    ({
      seekBy: jest.fn(),
      currentTime: 30,
      duration: 120,
      muted: false,
      volume: 0.8,
    }) as any;

  it("does not render while hidden", () => {
    const screen = render(
      <PlayerControls
        player={createPlayer()}
        currentTime={60}
        duration={120}
        isVisible={false}
        isPlaying={false}
        onPlayPause={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText("Play playback")).toBeNull();
  });

  it("exposes play/pause and skip controls", () => {
    const player = createPlayer();
    const onPlayPause = jest.fn();
    const screen = render(
      <PlayerControls
        player={player}
        currentTime={60}
        duration={120}
        isVisible
        isPlaying={false}
        onPlayPause={onPlayPause}
      />,
    );

    fireEvent.press(screen.getByLabelText("Play playback"));
    fireEvent.press(screen.getByLabelText("Seek back 10 seconds"));
    fireEvent.press(screen.getByLabelText("Seek forward 10 seconds"));

    expect(onPlayPause).toHaveBeenCalledTimes(1);
    expect(player.seekBy).toHaveBeenCalledWith(-10);
    expect(player.seekBy).toHaveBeenCalledWith(10);
  });

  it("supports accessibility seek actions on the progress control", () => {
    const player = createPlayer();
    const screen = render(
      <PlayerControls
        player={player}
        currentTime={30}
        duration={120}
        isVisible
        isPlaying
        onPlayPause={jest.fn()}
      />,
    );

    const progress = screen.getByLabelText("Playback progress");

    fireEvent(progress, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    fireEvent(progress, "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });

    expect(player.seekBy).toHaveBeenCalledWith(10);
    expect(player.seekBy).toHaveBeenCalledWith(-10);
  });

  it("disables misleading seek controls for non-seekable streams", () => {
    const player = createPlayer();
    const screen = render(
      <PlayerControls
        player={player}
        currentTime={30}
        duration={120}
        isVisible
        isPlaying
        onPlayPause={jest.fn()}
        capabilities={{
          canSeek: false,
          isLive: false,
          isRemux: true,
          canUseVolume: false,
          canUseFullscreen: false,
        }}
      />,
    );

    fireEvent.press(screen.getByLabelText("Seek back unavailable"));
    fireEvent.press(screen.getByLabelText("Seek forward unavailable"));
    fireEvent(
      screen.getByLabelText("Playback progress unavailable"),
      "accessibilityAction",
      {
        nativeEvent: { actionName: "increment" },
      },
    );

    expect(player.seekBy).not.toHaveBeenCalled();
    expect(screen.getByText("Preparing compatible stream")).toBeTruthy();
  });

  it("renders desktop playback actions when callbacks are available", () => {
    const player = createPlayer();
    const onToggleMute = jest.fn();
    const onToggleFullscreen = jest.fn();
    const onOpenSettings = jest.fn();
    const onOpenCast = jest.fn();
    const onRetry = jest.fn();

    const screen = render(
      <PlayerControls
        player={player}
        currentTime={30}
        duration={120}
        isVisible
        isPlaying
        onPlayPause={jest.fn()}
        onToggleMute={onToggleMute}
        onToggleFullscreen={onToggleFullscreen}
        onOpenSettings={onOpenSettings}
        onOpenCast={onOpenCast}
        onRetry={onRetry}
        volume={0.6}
        muted={false}
        sourceLabel="1080p MP4"
        downloadStatus="Ready offline"
        castStatus="Living Room"
        fallbackReason="Trying another source automatically."
        capabilities={{
          canSeek: true,
          isLive: false,
          isRemux: false,
          canUseVolume: true,
          canUseFullscreen: true,
          hasCaptions: true,
          canCast: true,
          canRetry: true,
        }}
      />,
    );

    fireEvent.press(screen.getByLabelText("Mute"));
    fireEvent.press(screen.getByLabelText("Fullscreen"));
    fireEvent.press(screen.getByLabelText("Audio, subtitles, and source"));
    fireEvent.press(screen.getByLabelText("Cast"));
    fireEvent.press(screen.getByLabelText("Retry source"));

    expect(screen.getByText("1080p MP4")).toBeTruthy();
    expect(screen.getByText("Ready offline")).toBeTruthy();
    expect(screen.getByText("Living Room")).toBeTruthy();
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenCast).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
