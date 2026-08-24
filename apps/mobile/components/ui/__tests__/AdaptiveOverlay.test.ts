import {
  resolveAdaptiveOverlayPresentation,
  resolveFocusTrapTarget,
} from "../AdaptiveOverlay";

describe("AdaptiveOverlay", () => {
  it("redirects focus into newly rendered overlay content", () => {
    const removedTrigger = {} as HTMLElement;
    const backButton = {} as HTMLElement;
    const doneButton = {} as HTMLElement;

    expect(
      resolveFocusTrapTarget(
        [backButton, doneButton],
        removedTrigger,
        false,
        false,
      ),
    ).toBe(backButton);
    expect(
      resolveFocusTrapTarget(
        [backButton, doneButton],
        removedTrigger,
        false,
        true,
      ),
    ).toBe(doneButton);
  });

  it.each([
    ["compact", "bottom-sheet"],
    ["medium", "floating-sheet"],
    ["expanded", "popover"],
    ["large", "popover"],
  ] as const)(
    "uses a %s presentation for %s windows",
    (windowClass, expected) => {
      expect(resolveAdaptiveOverlayPresentation(windowClass)).toBe(expected);
    },
  );

  it("keeps form overlays centered and width-constrained outside compact windows", () => {
    const overlay = require("../AdaptiveOverlay");

    expect(
      overlay.resolveAdaptiveOverlayLayout?.("large", "form", "center"),
    ).toEqual({
      presentation: "popover",
      placement: "center",
      maxWidth: 560,
    });
    expect(
      overlay.resolveAdaptiveOverlayLayout?.("compact", "form", "center"),
    ).toEqual({
      presentation: "bottom-sheet",
      placement: "bottom",
      maxWidth: undefined,
    });
  });

  it("provides a deliberately light backdrop for anchored utility menus", () => {
    const overlay = require("../AdaptiveOverlay");

    expect(overlay.resolveAdaptiveOverlayBackdrop?.("soft", true)).toBe(
      "rgba(0,0,0,0.16)",
    );
    expect(overlay.resolveAdaptiveOverlayBackdrop?.("none", true)).toBe(
      "transparent",
    );
  });
});
