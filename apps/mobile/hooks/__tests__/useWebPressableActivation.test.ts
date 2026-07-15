import {
  handleKeyboardActivation,
  isFocusVisibleEvent,
  isKeyboardActivationEvent,
  setWebInputModality,
} from "../useWebPressableActivation";

describe("web pressable keyboard activation", () => {
  it("recognizes Enter and Space activation keys", () => {
    expect(isKeyboardActivationEvent({ key: "Enter" })).toBe(true);
    expect(isKeyboardActivationEvent({ key: " " })).toBe(true);
    expect(
      isKeyboardActivationEvent({ nativeEvent: { key: "Spacebar" } }),
    ).toBe(true);
    expect(isKeyboardActivationEvent({ key: "ArrowRight" })).toBe(false);
  });

  it("activates and suppresses default bubbling for activation keys", () => {
    const onActivate = jest.fn();
    const event = {
      key: "Enter",
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };

    expect(handleKeyboardActivation(event, onActivate)).toBe(true);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("ignores non-activation keys", () => {
    const onActivate = jest.fn();
    const event = {
      key: "Escape",
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };

    expect(handleKeyboardActivation(event, onActivate)).toBe(false);
    expect(onActivate).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("only treats :focus-visible focus as keyboard focus", () => {
    const matches = jest.fn(
      (selector: string) => selector === ":focus-visible",
    );

    expect(isFocusVisibleEvent({ currentTarget: { matches } })).toBe(true);
    expect(matches).toHaveBeenCalledWith(":focus-visible");
    expect(
      isFocusVisibleEvent({
        currentTarget: { matches: () => false },
      }),
    ).toBe(false);
  });

  it("keeps an accessible fallback when selector matching is unavailable", () => {
    setWebInputModality("keyboard");
    expect(isFocusVisibleEvent()).toBe(true);
    expect(
      isFocusVisibleEvent({
        currentTarget: {
          matches: () => {
            throw new Error("unsupported selector");
          },
        },
      }),
    ).toBe(true);
  });

  it("suppresses the legacy fallback for pointer focus and restores it for keyboard input", () => {
    setWebInputModality("pointer");
    const unsupportedFocus = {
      currentTarget: {
        matches: () => {
          throw new Error("unsupported selector");
        },
      },
    };

    expect(isFocusVisibleEvent(unsupportedFocus)).toBe(false);
    setWebInputModality("keyboard");

    expect(isFocusVisibleEvent(unsupportedFocus)).toBe(true);
  });
});
