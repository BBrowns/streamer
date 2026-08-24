import {
  deriveCinematicTheme,
  getCinematicThemeSourceUri,
  getFallbackCinematicTheme,
  isHttpArtworkUri,
  relativeContrast,
} from "../cinematicTheme";

describe("cinematic theme derivation", () => {
  it("normalizes iOS, Android, and web result shapes", () => {
    const ios = deriveCinematicTheme(
      {
        platform: "ios",
        background: "#31506B",
        primary: "#F6E8D1",
        secondary: "#8D674A",
        detail: "#B98255",
      },
      true,
    );
    const android = deriveCinematicTheme(
      {
        platform: "android",
        dominant: "#9B633C",
        average: "#6B4B38",
        vibrant: "#D67A36",
        darkVibrant: "#6B351E",
        lightVibrant: "#F2B77A",
        darkMuted: "#4A372C",
        lightMuted: "#C8A68C",
        muted: "#896C59",
      },
      true,
    );
    const web = deriveCinematicTheme(
      {
        platform: "web",
        dominant: "#435F73",
        vibrant: "#58A3C4",
        darkVibrant: "#254657",
        lightVibrant: "#99C8D8",
        darkMuted: "#354B55",
        lightMuted: "#A8BCC2",
        muted: "#657F88",
      },
      false,
    );

    expect(ios.accent).not.toBe(getFallbackCinematicTheme(true).accent);
    expect(android.accent).toMatch(/^#[0-9A-F]{6}$/);
    expect(web.accent).toMatch(/^#[0-9A-F]{6}$/);
    expect(ios.progress).toBe(ios.accentStrong);
    expect(android.progress).toBe(android.accentStrong);
    expect(web.progress).toBe(web.accentStrong);
  });

  it("keeps warm and cool artwork palettes visibly distinct", () => {
    const warm = deriveCinematicTheme(
      {
        platform: "web",
        dominant: "#A44F2D",
        vibrant: "#D66C35",
        darkVibrant: "#6B2D1B",
        lightVibrant: "#E59A72",
        darkMuted: "#704231",
        lightMuted: "#B88B74",
        muted: "#8B5A43",
      },
      true,
    );
    const cool = deriveCinematicTheme(
      {
        platform: "web",
        dominant: "#365B78",
        vibrant: "#4E89B5",
        darkVibrant: "#243F55",
        lightVibrant: "#91B8D1",
        darkMuted: "#334957",
        lightMuted: "#8CA4B1",
        muted: "#587080",
      },
      true,
    );

    expect(warm.accent).not.toBe(cool.accent);
    expect(warm.ambient).not.toBe(cool.ambient);
    expect(warm.progress).not.toBe(cool.progress);
  });

  it("rejects black, white, and excessively saturated swatches", () => {
    const theme = deriveCinematicTheme(
      {
        platform: "web",
        dominant: "#000000",
        vibrant: "#FF00FF",
        darkVibrant: "#050505",
        lightVibrant: "#FFFFFF",
        darkMuted: "#030303",
        lightMuted: "#FAFAFA",
        muted: "#080808",
      },
      true,
    );

    expect(theme).toEqual(getFallbackCinematicTheme(true));
  });

  it("keeps focus contrast at or above three to one", () => {
    for (const isDark of [true, false]) {
      const theme = deriveCinematicTheme(
        {
          platform: "ios",
          background: "#6E6A62",
          primary: "#7A756D",
          secondary: "#756F67",
          detail: "#716C64",
        },
        isDark,
      );
      const canvas = isDark ? "#08090B" : "#F3F2EF";
      expect(relativeContrast(theme.focus, canvas)).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses a valid backdrop before a poster without accepting unsafe schemes", () => {
    expect(
      getCinematicThemeSourceUri({
        contentKey: "movie:tt0133093",
        backgroundUri: "https://images.example.test/backdrop.jpg",
        posterUri: "https://images.example.test/poster.jpg",
      }),
    ).toBe("https://images.example.test/backdrop.jpg");
    expect(
      getCinematicThemeSourceUri({
        contentKey: "movie:tt0133093",
        backgroundUri: "file:///private/backdrop.jpg",
        posterUri: "https://images.example.test/poster.jpg",
      }),
    ).toBe("https://images.example.test/poster.jpg");
    expect(isHttpArtworkUri("javascript:alert(1)")).toBe(false);
  });
});
