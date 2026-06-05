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
});
