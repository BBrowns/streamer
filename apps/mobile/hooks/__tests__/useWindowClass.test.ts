import { getWindowClass } from "../useWindowClass";

describe("getWindowClass", () => {
  it.each([
    [0, "compact"],
    [599, "compact"],
    [600, "medium"],
    [839, "medium"],
    [840, "expanded"],
    [1199, "expanded"],
    [1200, "large"],
  ] as const)("maps %i to %s", (width, expected) => {
    expect(getWindowClass(width)).toBe(expected);
  });
});
