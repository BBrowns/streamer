import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Platform } from "react-native";
import { getVolumeFromKeyboard, PlayerControls } from "../PlayerControls";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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

jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
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

  it("supports web keyboard controls on the progress slider", () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    const onSeekBy = jest.fn();
    const onSeekTo = jest.fn();
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();

    try {
      const screen = render(
        <PlayerControls
          player={createPlayer()}
          currentTime={30}
          duration={120}
          isVisible
          isPlaying
          onPlayPause={jest.fn()}
          onSeekBy={onSeekBy}
          onSeekTo={onSeekTo}
          capabilities={{ canSeek: true }}
        />,
      );
      const progress = screen.getByTestId("player-progress-slider");

      fireEvent(progress, "keyDown", {
        key: "ArrowRight",
        preventDefault,
        stopPropagation,
      });
      fireEvent(progress, "keyDown", {
        key: "Home",
        preventDefault,
        stopPropagation,
      });
      fireEvent(progress, "keyDown", {
        key: "End",
        preventDefault,
        stopPropagation,
      });

      expect(onSeekBy).toHaveBeenCalledWith(10);
      expect(onSeekTo).toHaveBeenCalledWith(0);
      expect(onSeekTo).toHaveBeenCalledWith(120);
      expect(preventDefault).toHaveBeenCalledTimes(3);
      expect(stopPropagation).toHaveBeenCalledTimes(3);
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: originalPlatform,
      });
    }
  });

  it("maps all standard web volume keys to bounded values", () => {
    expect(getVolumeFromKeyboard(0.6, "ArrowLeft")).toBe(0.5);
    expect(getVolumeFromKeyboard(0.6, "ArrowDown")).toBe(0.5);
    expect(getVolumeFromKeyboard(0.6, "ArrowRight")).toBe(0.7);
    expect(getVolumeFromKeyboard(0.6, "ArrowUp")).toBe(0.7);
    expect(getVolumeFromKeyboard(0.6, "Home")).toBe(0);
    expect(getVolumeFromKeyboard(0.6, "End")).toBe(1);
    expect(getVolumeFromKeyboard(0.6, "k")).toBeNull();
    expect(getVolumeFromKeyboard(0, "ArrowDown")).toBe(0);
    expect(getVolumeFromKeyboard(1, "ArrowUp")).toBe(1);
  });

  it("handles volume slider keys locally and stops them from bubbling", () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    const onVolumeChange = jest.fn();
    const preventDefault = jest.fn();
    const stopPropagation = jest.fn();

    try {
      const screen = render(
        <PlayerControls
          player={createPlayer()}
          currentTime={30}
          duration={120}
          isVisible
          isPlaying
          onPlayPause={jest.fn()}
          volume={0.6}
          onVolumeChange={onVolumeChange}
          capabilities={{ canSeek: true, canUseVolume: true }}
        />,
      );
      const volume = screen.getByTestId("player-volume-slider");

      for (const key of [
        "ArrowLeft",
        "ArrowDown",
        "ArrowRight",
        "ArrowUp",
        "Home",
        "End",
      ]) {
        fireEvent(volume, "keyDown", {
          key,
          preventDefault,
          stopPropagation,
        });
      }
      fireEvent(volume, "keyDown", {
        key: "k",
        preventDefault,
        stopPropagation,
      });

      expect(onVolumeChange.mock.calls.map(([value]) => value)).toEqual([
        0.5, 0.5, 0.7, 0.7, 0, 1,
      ]);
      expect(preventDefault).toHaveBeenCalledTimes(6);
      expect(stopPropagation).toHaveBeenCalledTimes(6);
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: originalPlatform,
      });
    }
  });

  it("disables misleading seek controls for non-seekable streams", () => {
    const player = createPlayer();
    const onSeekBy = jest.fn();
    const screen = render(
      <PlayerControls
        player={player}
        currentTime={30}
        duration={120}
        isVisible
        isPlaying
        onPlayPause={jest.fn()}
        onSeekBy={onSeekBy}
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
    expect(onSeekBy).not.toHaveBeenCalled();
    expect(screen.getByText("Preparing compatible stream")).toBeTruthy();
    expect(
      screen.getByText("Seeking unlocks when the compatible stream is ready"),
    ).toBeTruthy();
  });

  it("routes seek controls through the provided guarded seek callback", () => {
    const player = createPlayer();
    const onSeekBy = jest.fn();
    const screen = render(
      <PlayerControls
        player={player}
        currentTime={30}
        duration={120}
        isVisible
        isPlaying
        onPlayPause={jest.fn()}
        onSeekBy={onSeekBy}
        capabilities={{ canSeek: true }}
      />,
    );

    fireEvent.press(screen.getByLabelText("Seek back 10 seconds"));
    fireEvent.press(screen.getByLabelText("Seek forward 10 seconds"));

    expect(onSeekBy).toHaveBeenCalledWith(-10);
    expect(onSeekBy).toHaveBeenCalledWith(10);
    expect(player.seekBy).not.toHaveBeenCalled();
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
