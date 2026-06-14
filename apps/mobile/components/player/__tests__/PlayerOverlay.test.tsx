import { render } from "@testing-library/react-native";
import { PlayerOverlay } from "../PlayerOverlay";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
  MaterialIcons: () => null,
}));

jest.mock("../castModules", () => ({
  CastButton: null,
  AirPlayButton: null,
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
        onSettings={jest.fn()}
        showInfoBar
      />,
    );

    expect(screen.getByTestId("player-stream-info").props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alignSelf: "center" }),
      ]),
    );
  });
});
