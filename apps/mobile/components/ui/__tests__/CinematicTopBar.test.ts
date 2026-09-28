import { PALETTE } from "../../../constants/theme";
import {
  resolveTopBarLayout,
  resolveTopBarPalette,
  resolveTopBarUnderlineLayout,
} from "../CinematicTopBar";

jest.mock("../../../contexts/CinematicThemeContext", () => ({
  useCinematicTheme: () => ({ theme: { focus: "#C89B6D" } }),
}));

describe("resolveTopBarLayout", () => {
  it("keeps the fixed medium top bar regions inside the narrow desktop viewport", () => {
    const layout = resolveTopBarLayout("medium");
    const fixedRegionsWidth =
      layout.leftPadding +
      layout.rightPadding +
      layout.brandWidth +
      layout.actionsWidth;

    expect(fixedRegionsWidth).toBeLessThanOrEqual(600);
    expect(layout.brandWidth).toBeLessThan(layout.actionsWidth);
    expect(layout.navGap).toBeGreaterThan(0);
  });
});

describe("resolveTopBarPalette", () => {
  it("keeps artwork-overlay chrome light in light mode", () => {
    const palette = resolveTopBarPalette("overlay", PALETTE.light, false);

    expect(palette.foreground).toBe("#F4F2EE");
    expect(palette.mark).toBe("#F4F2EE");
    expect(palette.onMark).toBe("#08090B");
  });

  it("uses the normal theme foreground on solid utility routes", () => {
    const palette = resolveTopBarPalette("solid", PALETTE.light, false);

    expect(palette.foreground).toBe(PALETTE.light.text);
    expect(palette.mark).toBe(PALETTE.light.primary);
  });
});

describe("resolveTopBarUnderlineLayout", () => {
  it.each([
    [30, 72, 21],
    [54, 96, 21],
    [86, 118, 16],
  ])(
    "centers a measured label (%i px) in its tab (%i px)",
    (labelWidth, tabWidth, expectedLeft) => {
      expect(resolveTopBarUnderlineLayout(labelWidth, tabWidth)).toEqual({
        left: expectedLeft,
        width: labelWidth,
      });
    },
  );
});
