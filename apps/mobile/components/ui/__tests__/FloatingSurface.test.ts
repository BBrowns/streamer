import { PALETTE } from "../../../constants/theme";
import {
  resolveFloatingSurfaceMaterial,
  type FloatingSurfaceLevel,
} from "../FloatingSurface";

describe("FloatingSurface material policy", () => {
  it.each(["menu", "sheet", "media"] as FloatingSurfaceLevel[])(
    "supports the approved %s level without changing the theme contract",
    (level) => {
      const material = resolveFloatingSurfaceMaterial({
        level,
        colors: PALETTE.dark,
        reducedTransparency: false,
        platform: "web",
      });

      expect(material.backgroundColor).toBeTruthy();
      expect(material.borderColor).toBe(PALETTE.dark.borderStrong);
      expect(material.elevation).toBeGreaterThan(0);
    },
  );

  it("uses an opaque fallback when transparency is reduced", () => {
    const material = resolveFloatingSurfaceMaterial({
      level: "menu",
      colors: PALETTE.dark,
      reducedTransparency: true,
      platform: "web",
    });

    expect(material.backgroundColor).toBe(PALETTE.dark.opaqueGlassFallback);
    expect(material.backdropFilter).toBeUndefined();
  });

  it("keeps Android sheets opaque without relying on native blur", () => {
    const material = resolveFloatingSurfaceMaterial({
      level: "sheet",
      colors: PALETTE.dark,
      reducedTransparency: false,
      platform: "android",
    });

    expect(material.backgroundColor).toBe(PALETTE.dark.opaqueGlassFallback);
    expect(material.backdropFilter).toBeUndefined();
  });

  it("keeps utility material owned by ThemeColors, not cinematic ambience", () => {
    const material = resolveFloatingSurfaceMaterial({
      level: "menu",
      colors: PALETTE.dark,
      reducedTransparency: false,
      platform: "web",
    });

    expect(material.backgroundColor).toBe(PALETTE.dark.surfaceFloating);
    expect(material.backgroundColor).not.toBe(PALETTE.dark.tint);
    expect(material).not.toHaveProperty("ambient");
    expect(material).not.toHaveProperty("glow");
  });
});
