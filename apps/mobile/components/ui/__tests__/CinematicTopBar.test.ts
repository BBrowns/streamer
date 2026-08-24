import { PALETTE } from "../../../constants/theme";
import { resolveTopBarLayout, resolveTopBarPalette } from "../CinematicTopBar";

jest.mock("../../../contexts/CinematicThemeContext", () => ({
  useCinematicTheme: () => ({ theme: { focus: "#C89B6D" } }),
}));

describe("resolveTopBarLayout", () => {
  it("keeps the medium navigation inside the narrowest desktop viewport", () => {
    const layout = resolveTopBarLayout("medium");
    const requiredWidth =
      layout.leftPadding +
      layout.rightPadding +
      layout.brandWidth +
      layout.actionsWidth +
      layout.navItemMinWidth * 3 +
      layout.navGap * 2;

    expect(requiredWidth).toBeLessThanOrEqual(600);
    expect(layout.brandWidth).toBeLessThan(layout.actionsWidth);
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
