import {
  handleKeyboardActivation,
  isKeyboardActivationEvent,
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
});
