import { fireEvent, render } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";
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
  it("holds chrome only for keyboard focus and releases it on pointer input", async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
    const onControlFocusChange = jest.fn();
    try {
      const screen = await render(
        <PlayerOverlay
          currentStream={{ title: "Example stream" } as any}
          engineType="hls"
          stats={{ peers: 0, speed: 0, progress: 0 } as any}
          onClose={jest.fn()}
          onControlFocusChange={onControlFocusChange}
        />,
      );
      const chrome = screen.getByTestId("player-top-chrome");
      const currentTarget = { matches: () => false };
      await fireEvent(chrome, "focus", {
        currentTarget,
        target: { matches: () => false },
      });
      expect(onControlFocusChange).toHaveBeenLastCalledWith(false);
      await fireEvent(chrome, "focus", {
        currentTarget,
        target: {
          matches: (selector: string) => selector === ":focus-visible",
        },
      });
      expect(onControlFocusChange).toHaveBeenLastCalledWith(true);
      await fireEvent(chrome, "pointerDown");
      expect(onControlFocusChange).toHaveBeenLastCalledWith(false);
      await fireEvent(chrome, "keyDownCapture", {
        target: { matches: () => true },
      });
      expect(onControlFocusChange).toHaveBeenLastCalledWith(true);
      await fireEvent(chrome, "blur", {
        currentTarget: { contains: () => false },
        relatedTarget: null,
      });
      expect(onControlFocusChange).toHaveBeenLastCalledWith(false);
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: originalPlatform,
      });
    }
  });

  it("renders optional stream info as a top panel instead of a bottom bar", async () => {
    const screen = await render(
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

  it("anchors playback settings in the top-right utility chrome", async () => {
    const onClose = jest.fn();
    const onOpenSettings = jest.fn();
    const screen = await render(
      <PlayerOverlay
        currentStream={{ title: "Example stream" } as any}
        engineType="hls"
        stats={{ peers: 0, speed: 0, progress: 0 } as any}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
        showInfoBar={false}
      />,
    );

    await fireEvent.press(screen.getByTestId("player-close-button"));
    await fireEvent.press(screen.getByTestId("player-settings-button"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Playback settings")).toBeTruthy();
  });

  it("keeps top chrome cinema-dark when app theme values would be light", async () => {
    const screen = await render(
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
