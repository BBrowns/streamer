/**
 * The player deliberately keeps its own visual environment. Playback needs
 * stable contrast over arbitrary video artwork, so its chrome stays cinema
 * dark even when the rest of the application uses the warm light theme.
 */
export const playerChrome = {
  canvas: "#050608",
  surface: "rgba(11, 13, 17, 0.78)",
  surfaceStrong: "rgba(11, 13, 17, 0.96)",
  surfaceRaised: "#171A20",
  surfaceHover: "rgba(244, 245, 247, 0.14)",
  surfacePressed: "rgba(244, 245, 247, 0.1)",
  text: "#F4F5F7",
  textMuted: "#B7BDC8",
  textDimmed: "#858C98",
  accent: "#8995FF",
  focus: "#B0B8FF",
  border: "rgba(244, 245, 247, 0.15)",
  borderStrong: "rgba(244, 245, 247, 0.26)",
  track: "rgba(244, 245, 247, 0.3)",
  scrim: "rgba(3, 4, 6, 0.84)",
  error: "#FF839B",
} as const;
