import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { PlayerOverlay } from "../PlayerOverlay";
import { playerChrome } from "../playerChrome";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
}));

jest.mock("../castModules", () => ({
  CastButton: null,
  AirPlayButton: null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      tint: "#a78bfa",
      text: "#ffffff",
      textSecondary: "#c7bfd5",
      border: "rgba(255,255,255,0.16)",
    },
  }),
}));

describe("PlayerOverlay", () => {
  it("renders optional stream info as a top panel instead of a bottom bar", () => {
    const screen = render(
      <PlayerOverlay
        currentStream={{ title: "Example stream" } as any}
        engineType="hls"
        stats={{ peers: 0, speed: 0, progress: 0 } as any}
        onClose={jest.fn()}
        showInfoBar
      />,
    );

    expect(screen.getByTestId("player-stream-info").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alignSelf: "center" }),
      ]),
    );
  });

  it("uses a compact close control without duplicating playback settings", () => {
    const onClose = jest.fn();
    const screen = render(
      <PlayerOverlay
        currentStream={{ title: "Example stream" } as any}
        engineType="hls"
        stats={{ peers: 0, speed: 0, progress: 0 } as any}
        onClose={onClose}
        showInfoBar={false}
      />,
    );

    fireEvent.press(screen.getByTestId("player-close-button"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Playback settings")).toBeNull();
  });

  it("keeps top chrome cinema-dark when app theme values would be light", () => {
    const screen = render(
      <PlayerOverlay
        currentStream={{ title: "Example stream" } as any}
        engineType="hls"
        stats={{ peers: 0, speed: 0, progress: 0 } as any}
        onClose={jest.fn()}
        showInfoBar={false}
      />,
    );

    const topChrome = StyleSheet.flatten(
      screen.getByTestId("player-top-chrome").props.style,
    );

    expect(topChrome.backgroundColor).toBe(playerChrome.surface);
  });
});
