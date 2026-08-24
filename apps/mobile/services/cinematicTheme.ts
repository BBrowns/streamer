export type CinematicTheme = {
  accent: string;
  accentStrong: string;
  accentSoft: string;
  ambient: string;
  ambientMuted: string;
  focus: string;
  progress: string;
  scrimDark: string;
  scrimTransparent: string;
  glow: string;
};

export type CinematicThemeSource = {
  contentKey: `${"movie" | "series"}:${string}`;
  backgroundUri?: string;
  posterUri?: string;
};

export type CinematicImageColorsResult =
  | {
      platform: "ios";
      background: string;
      primary: string;
      secondary: string;
      detail: string;
    }
  | {
      platform: "android";
      dominant: string;
      average: string;
      vibrant: string;
      darkVibrant: string;
      lightVibrant: string;
      darkMuted: string;
      lightMuted: string;
      muted: string;
    }
  | {
      platform: "web";
      dominant: string;
      vibrant: string;
      darkVibrant: string;
      lightVibrant: string;
      darkMuted: string;
      lightMuted: string;
      muted: string;
    };

type Rgb = { r: number; g: number; b: number };

const DARK_CANVAS = "#08090B";
const LIGHT_CANVAS = "#F3F2EF";
const DARK_FALLBACK = "#C89B6D";
const LIGHT_FALLBACK = "#8A5A35";

function parseHex(value: string): Rgb | null {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb) {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.max(0, Math.min(255, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function blend(from: string, to: string, amount: number) {
  const start = parseHex(from);
  const end = parseHex(to);
  if (!start || !end) return from.toUpperCase();
  const ratio = Math.max(0, Math.min(1, amount));
  return toHex({
    r: start.r + (end.r - start.r) * ratio,
    g: start.g + (end.g - start.g) * ratio,
    b: start.b + (end.b - start.b) * ratio,
  });
}

function rgba(value: string, alpha: number) {
  const rgb = parseHex(value);
  return rgb
    ? `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.max(0, Math.min(1, alpha))})`
    : "rgba(200,155,109,0)";
}

function luminance(value: string) {
  const rgb = parseHex(value);
  if (!rgb) return null;
  const channels = [rgb.r, rgb.g, rgb.b]
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function relativeContrast(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return 1;
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function saturation(value: string) {
  const rgb = parseHex(value);
  if (!rgb) return null;
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => channel / 255);
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * lightness - 1));
}

function isUsableSwatch(value: string) {
  const swatchLuminance = luminance(value);
  const swatchSaturation = saturation(value);
  return (
    swatchLuminance !== null &&
    swatchSaturation !== null &&
    swatchLuminance >= 0.035 &&
    swatchLuminance <= 0.9 &&
    swatchSaturation <= 0.92
  );
}

function ensureFocusContrast(value: string, canvas: string, isDark: boolean) {
  let result = value.toUpperCase();
  const target = isDark ? "#FFFFFF" : "#000000";
  for (let index = 0; index < 12; index += 1) {
    if (relativeContrast(result, canvas) >= 3) return result;
    result = blend(result, target, 0.14);
  }
  return isDark ? "#D6AA7C" : "#7A4C2E";
}

function buildTheme(accent: string, isDark: boolean): CinematicTheme {
  const canvas = isDark ? DARK_CANVAS : LIGHT_CANVAS;
  const normalizedAccent = accent.toUpperCase();
  return {
    accent: normalizedAccent,
    accentStrong: blend(normalizedAccent, isDark ? "#FFFFFF" : "#000000", 0.16),
    accentSoft: rgba(normalizedAccent, isDark ? 0.16 : 0.1),
    ambient: blend(canvas, normalizedAccent, isDark ? 0.12 : 0.06),
    ambientMuted: blend(canvas, normalizedAccent, isDark ? 0.06 : 0.03),
    focus: ensureFocusContrast(normalizedAccent, canvas, isDark),
    progress: blend(normalizedAccent, isDark ? "#FFFFFF" : "#000000", 0.16),
    scrimDark: isDark ? "rgba(8,9,11,0.86)" : "rgba(16,18,22,0.72)",
    scrimTransparent: isDark ? "rgba(8,9,11,0)" : "rgba(243,242,239,0)",
    glow: rgba(normalizedAccent, isDark ? 0.18 : 0.12),
  };
}

export function getFallbackCinematicTheme(isDark: boolean) {
  return buildTheme(isDark ? DARK_FALLBACK : LIGHT_FALLBACK, isDark);
}

export function deriveCinematicTheme(
  result: CinematicImageColorsResult,
  isDark: boolean,
): CinematicTheme {
  const candidates =
    result.platform === "ios"
      ? [result.background, result.detail, result.secondary, result.primary]
      : [
          result.darkMuted,
          result.muted,
          result.dominant,
          result.vibrant,
          result.darkVibrant,
          result.lightMuted,
          result.lightVibrant,
        ];
  const selected = candidates.find(isUsableSwatch);
  return selected
    ? buildTheme(selected, isDark)
    : getFallbackCinematicTheme(isDark);
}

export function isHttpArtworkUri(uri?: string | null) {
  if (!uri) return false;
  try {
    const parsed = new URL(uri.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getCinematicThemeSourceUri(source: CinematicThemeSource) {
  if (isHttpArtworkUri(source.backgroundUri))
    return source.backgroundUri!.trim();
  if (isHttpArtworkUri(source.posterUri)) return source.posterUri!.trim();
  return undefined;
}
