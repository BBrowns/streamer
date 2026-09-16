import { Platform } from "react-native";
import { blurWebFocus } from "../navigation";

describe("blurWebFocus", () => {
  const originalPlatform = Platform.OS;
  const originalDocument = (globalThis as any).document;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatform,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });

  it("blurs the active web control before a route is hidden", () => {
    const blur = jest.fn();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { activeElement: { blur } },
    });

    blurWebFocus();

    expect(blur).toHaveBeenCalledTimes(1);
  });
});
