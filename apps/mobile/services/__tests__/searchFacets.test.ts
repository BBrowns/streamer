import type { MetaPreview } from "@streamer/shared";
import { buildSearchFacetOptions, matchesSearchFacet } from "../searchFacets";

const item = (overrides: Partial<MetaPreview> = {}): MetaPreview => ({
  id: "tt1",
  type: "movie",
  name: "The Matrix",
  poster: "",
  ...overrides,
});

describe("search facets", () => {
  it("builds bounded, case-insensitive genre options", () => {
    expect(
      buildSearchFacetOptions(
        [
          item({ genres: ["  Sci-Fi ", "Drama"] }),
          item({ id: "tt2", genres: ["sci-fi", "Comedy"] }),
        ],
        "genre",
        "Any genre",
      ),
    ).toEqual([
      { label: "Any genre", value: "all" },
      { label: "Comedy", value: "comedy" },
      { label: "Drama", value: "drama" },
      { label: "Sci-Fi", value: "sci-fi" },
    ]);
  });

  it("matches language values without changing provider spelling", () => {
    const result = item({ originalLanguage: "EN" });
    expect(matchesSearchFacet(result, "language", "en")).toBe(true);
    expect(matchesSearchFacet(result, "language", "nl")).toBe(false);
    expect(matchesSearchFacet(result, "language", "all")).toBe(true);
  });
});
