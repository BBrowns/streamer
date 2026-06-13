import { PALETTE } from "../../../constants/theme";
import {
  getSoftOverlayColor,
  getSurfaceColors,
  getToneColor,
  uiRadii,
  uiSpacing,
  uiTypography,
} from "../designSystem";

describe("design system tokens", () => {
  it("keeps spacing, radii, and typography stable for UI primitives", () => {
    expect(uiSpacing).toMatchObject({ sm: 8, md: 12, lg: 16 });
    expect(uiRadii).toMatchObject({ xs: 8, md: 16, pill: 999 });
    expect(uiTypography.control).toMatchObject({
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "800",
    });
  });

  it("maps surface and status tones through theme colors", () => {
    expect(getSurfaceColors(PALETTE.light, false, "default")).toMatchObject({
      backgroundColor: PALETTE.light.card,
      borderColor: PALETTE.light.border,
    });
    expect(getSurfaceColors(PALETTE.dark, true, "danger")).toMatchObject({
      borderColor: PALETTE.dark.error + "42",
    });
    expect(getToneColor(PALETTE.light, "success")).toBe(PALETTE.light.success);
    expect(getSoftOverlayColor(true)).toBe("rgba(9,10,18,0.68)");
  });
});
