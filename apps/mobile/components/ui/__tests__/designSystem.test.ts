import { PALETTE } from "../../../constants/theme";
import { Platform } from "react-native";
import {
  getWebAriaChecked,
  getWebFocusStyle,
  getWebMediaFocusStyle,
  getSoftOverlayColor,
  getSurfaceColors,
  getToneColor,
  getPosterCardWidth,
  getWindowGutter,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
  uiLayout,
  uiMotion,
  uiFonts,
  resolveMotionDuration,
} from "../designSystem";

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe("design system tokens", () => {
  it("keeps spacing, radii, and typography stable for UI primitives", () => {
    expect(uiSpacing).toMatchObject({ sm: 8, md: 12, lg: 16 });
    expect(uiRadii).toMatchObject({
      xxs: 6,
      control: 8,
      card: 12,
      sheet: 20,
      pill: 999,
    });
    expect([44, 48]).toContain(uiTouchTarget);
    expect(uiFonts.regular.toLowerCase()).toContain("system");
    expect(uiFonts.cinematic).toBe("InstrumentSerif_400Regular");
    expect(uiTypography.control).toMatchObject({
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    });
    expect(uiTypography.utilityTitle).toMatchObject({
      fontSize: 32,
      lineHeight: 38,
      fontWeight: "600",
    });
  });

  it("exposes semantic content widths and motion intents", () => {
    expect(uiLayout).toMatchObject({
      contentMaxWidth: 1560,
      detailMaxWidth: 1200,
      settingsMaxWidth: 1120,
      settingsColumnMinWidth: 360,
      settingsColumnGap: 32,
      readingMaxWidth: 760,
      compactGutter: 20,
      expandedGutter: 40,
      largeGutter: 56,
      pageWidths: {
        cinematic: 1560,
        catalog: 1560,
        utilityWide: 1120,
        utilityNarrow: 760,
      },
    });
    expect(uiMotion).toMatchObject({
      feedback: 90,
      content: 140,
      spatial: 200,
      overlay: 240,
      emphasis: 360,
      loadingLoop: 1500,
    });
  });

  it("maps every window class to canonical gutters and poster widths", () => {
    expect(
      ["compact", "medium", "expanded", "large"].map((windowClass) =>
        getWindowGutter(
          windowClass as "compact" | "medium" | "expanded" | "large",
        ),
      ),
    ).toEqual([20, 24, 40, 56]);
    expect(
      ["compact", "medium", "expanded", "large"].map((windowClass) =>
        getPosterCardWidth(
          windowClass as "compact" | "medium" | "expanded" | "large",
        ),
      ),
    ).toEqual([132, 152, 168, 198]);

    const designSystem = require("../designSystem");
    expect(
      ["compact", "medium", "expanded", "large"].map((windowClass) =>
        designSystem.getHomeHeroOverlap?.(windowClass),
      ),
    ).toEqual([36, 48, 64, 88]);
  });

  it("resolves motion to zero when reduced motion is requested", () => {
    expect(resolveMotionDuration("feedback", false)).toBe(90);
    expect(resolveMotionDuration("overlay", false)).toBe(240);
    expect(resolveMotionDuration("loadingLoop", true)).toBe(0);
  });

  it("provides a visible keyboard focus treatment", () => {
    expect(getWebFocusStyle("#a78bfa")).toEqual({
      outlineStyle: "solid",
      outlineWidth: 3,
      outlineColor: "#a78bfa",
      outlineOffset: 2,
    });
  });

  it("keeps media hover quiet and gives keyboard focus its own compact ring", () => {
    expect(getWebMediaFocusStyle("#365B78")).toEqual({
      outlineStyle: "solid",
      outlineWidth: 2,
      outlineColor: "#365B78",
      outlineOffset: 3,
    });
  });

  it("exposes checked state as ARIA only for web controls", () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });

    try {
      expect(getWebAriaChecked(true)).toEqual({ "aria-checked": true });
      expect(getWebAriaChecked(false)).toEqual({ "aria-checked": false });
    } finally {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: originalPlatform,
      });
    }
  });

  it("maps surface and status tones through theme colors", () => {
    expect(getSurfaceColors(PALETTE.light, false, "default")).toMatchObject({
      backgroundColor: PALETTE.light.card,
      borderColor: "transparent",
    });
    expect(getSurfaceColors(PALETTE.dark, true, "danger")).toMatchObject({
      borderColor: PALETTE.dark.error + "42",
    });
    expect(getToneColor(PALETTE.light, "success")).toBe(PALETTE.light.success);
    expect(getToneColor(PALETTE.light, "info")).toBe(PALETTE.light.info);
    expect(getSoftOverlayColor(true)).toBe("rgba(8,9,11,0.72)");
  });

  it("uses the Living Cinema palette", () => {
    expect(PALETTE.dark).toMatchObject({
      background: "#08090B",
      card: "#111318",
      surfaceSubtle: "#0D0F12",
      text: "#F4F2EE",
      textSecondary: "#B8B5B0",
      textTertiary: "#85848A",
      tint: "#C89B6D",
      brandAccent: "#C89B6D",
      info: "#7E9CC5",
    });
    expect(PALETTE.light).toMatchObject({
      background: "#F3F2EF",
      card: "#FFFFFF",
      text: "#101216",
      textSecondary: "#656B75",
      tint: "#8A5A35",
      brandAccent: "#8A5A35",
      info: "#496B96",
    });
  });

  it("keeps filled accent controls at WCAG AA text contrast", () => {
    for (const palette of Object.values(PALETTE)) {
      expect(
        contrastRatio(palette.onTint, palette.tint),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
