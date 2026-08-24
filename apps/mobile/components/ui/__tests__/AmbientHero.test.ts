import { getAmbientHeroArtworkMode } from "../AmbientHero";

jest.mock("react-native-image-colors", () => ({ getColors: jest.fn() }));

describe("AmbientHero artwork policy", () => {
  it("prioritizes a real landscape backdrop", () => {
    expect(
      getAmbientHeroArtworkMode({
        backgroundUri: "https://images.example.test/backdrop.jpg",
        posterUri: "https://images.example.test/poster.jpg",
      }),
    ).toBe("backdrop");
  });

  it("uses a contained poster when the backdrop is unavailable", () => {
    expect(
      getAmbientHeroArtworkMode({
        posterUri: "https://images.example.test/poster.jpg",
      }),
    ).toBe("contained-poster");
  });

  it("falls back to ambience without inventing an artwork crop", () => {
    expect(getAmbientHeroArtworkMode({})).toBe("ambient");
  });
});
