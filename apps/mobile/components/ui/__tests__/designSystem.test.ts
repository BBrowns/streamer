import { PALETTE } from "../../../constants/theme";
import { Platform } from "react-native";
import {
  getWebAriaChecked,
  getWebFocusStyle,
  getSoftOverlayColor,
  getSurfaceColors,
  getToneColor,
  uiRadii,
  uiSpacing,
  uiTouchTarget,
  uiTypography,
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
      control: 8,
      card: 12,
      sheet: 20,
      pill: 999,
    });
    expect(uiTouchTarget).toBe(44);
    expect(uiTypography.control).toMatchObject({
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "700",
    });
  });

  it("provides a visible keyboard focus treatment", () => {
    expect(getWebFocusStyle("#a78bfa")).toEqual({
      outlineStyle: "solid",
      outlineWidth: 3,
      outlineColor: "#a78bfa",
      outlineOffset: 2,
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
    expect(getSoftOverlayColor(true)).toBe("rgba(8,9,12,0.72)");
  });

  it("uses the Obsidian Editorial palette", () => {
    expect(PALETTE.dark).toMatchObject({
      background: "#08090C",
      card: "#111318",
      surfaceElevated: "#181B21",
      text: "#F4F5F7",
      textSecondary: "#9DA3AE",
      tint: "#6C79F5",
    });
    expect(PALETTE.light).toMatchObject({
      background: "#F3F2EF",
      card: "#FFFFFF",
      text: "#101216",
      textSecondary: "#656B75",
      tint: "#4F5FD1",
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
