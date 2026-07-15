import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";
import {
  getPlayerEscapeAction,
  isPlayerHotkeyTargetInteractive,
  usePlayerHotkeys,
} from "../usePlayerHotkeys";

describe("usePlayerHotkeys", () => {
  const originalPlatform = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("routes Escape to the provided cancellation callback", () => {
    const onEscape = jest.fn(() => true);
    const preventDefault = jest.fn();
    const addListener = jest.fn();
    const removeListener = jest.fn();
    const originalAddEventListener = (window as any).addEventListener;
    const originalRemoveEventListener = (window as any).removeEventListener;
    Object.defineProperty(window, "addEventListener", {
      configurable: true,
      value: addListener,
    });
    Object.defineProperty(window, "removeEventListener", {
      configurable: true,
      value: removeListener,
    });

    const { unmount } = renderHook(() =>
      usePlayerHotkeys({
        player: null,
        showControls: jest.fn(),
        setSeekFeedback: jest.fn(),
        seekFeedbackTimer: { current: null },
        SEEK_SECONDS: 10,
        onEscape,
      }),
    );

    const keydown = addListener.mock.calls.find(
      ([eventName]) => eventName === "keydown",
    )?.[1] as EventListener;
    act(() => {
      keydown({ key: "Escape", preventDefault } as unknown as Event);
    });

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    unmount();
    Object.defineProperty(window, "addEventListener", {
      configurable: true,
      value: originalAddEventListener,
    });
    Object.defineProperty(window, "removeEventListener", {
      configurable: true,
      value: originalRemoveEventListener,
    });
  });

  it("closes nested player UI before cancelling preparation", () => {
    expect(
      getPlayerEscapeAction({
        settingsOpen: true,
        castOpen: true,
        preparationActive: true,
      }),
    ).toBe("closeSettings");
    expect(
      getPlayerEscapeAction({
        settingsOpen: false,
        castOpen: true,
        preparationActive: true,
      }),
    ).toBe("closeCast");
    expect(
      getPlayerEscapeAction({
        settingsOpen: false,
        castOpen: false,
        preparationActive: true,
      }),
    ).toBe("cancelPreparation");
  });

  it("recognizes native and ARIA interactive descendants", () => {
    const interactiveTarget = {
      closest: jest.fn(() => ({ role: "slider" })),
    } as unknown as EventTarget;
    const passiveTarget = {
      closest: jest.fn(() => null),
    } as unknown as EventTarget;

    expect(isPlayerHotkeyTargetInteractive(interactiveTarget)).toBe(true);
    expect(isPlayerHotkeyTargetInteractive(passiveTarget)).toBe(false);
    expect(isPlayerHotkeyTargetInteractive(null)).toBe(false);
  });

  it("yields conflicting shortcuts to focused interactive controls", () => {
    const player = {
      playing: false,
      play: jest.fn(),
      pause: jest.fn(),
      seekBy: jest.fn(),
      muted: false,
      duration: 120,
    } as any;
    const onSeekBy = jest.fn();
    const onToggleMute = jest.fn();
    const showControls = jest.fn();
    const seekFeedbackTimer = {
      current: null as ReturnType<typeof setTimeout> | null,
    };
    const addListener = jest.fn();
    const removeListener = jest.fn();
    const originalAddEventListener = (window as any).addEventListener;
    const originalRemoveEventListener = (window as any).removeEventListener;
    Object.defineProperty(window, "addEventListener", {
      configurable: true,
      value: addListener,
    });
    Object.defineProperty(window, "removeEventListener", {
      configurable: true,
      value: removeListener,
    });
    const { unmount } = renderHook(() =>
      usePlayerHotkeys({
        player,
        showControls,
        setSeekFeedback: jest.fn(),
        seekFeedbackTimer,
        SEEK_SECONDS: 10,
        onSeekBy,
        onToggleMute,
      }),
    );
    const keydown = addListener.mock.calls.find(
      ([eventName]) => eventName === "keydown",
    )?.[1] as EventListener;
    const interactiveTarget = {
      closest: jest.fn(() => ({ role: "slider" })),
    } as unknown as EventTarget;
    const passiveTarget = {
      closest: jest.fn(() => null),
    } as unknown as EventTarget;
    const keyboardEvent = (key: string, target: EventTarget) =>
      ({
        key,
        target,
        defaultPrevented: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        preventDefault: jest.fn(),
      }) as unknown as Event;

    act(() => {
      keydown(keyboardEvent(" ", interactiveTarget));
      keydown(keyboardEvent("ArrowRight", interactiveTarget));
      keydown(keyboardEvent("m", interactiveTarget));
    });

    expect(player.play).not.toHaveBeenCalled();
    expect(onSeekBy).not.toHaveBeenCalled();
    expect(onToggleMute).not.toHaveBeenCalled();
    expect(showControls).not.toHaveBeenCalled();

    act(() => {
      keydown(keyboardEvent("ArrowRight", passiveTarget));
    });
    expect(onSeekBy).toHaveBeenCalledWith(10);

    if (seekFeedbackTimer.current) clearTimeout(seekFeedbackTimer.current);
    unmount();
    Object.defineProperty(window, "addEventListener", {
      configurable: true,
      value: originalAddEventListener,
    });
    Object.defineProperty(window, "removeEventListener", {
      configurable: true,
      value: originalRemoveEventListener,
    });
  });
});
