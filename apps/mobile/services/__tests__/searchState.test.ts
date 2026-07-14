import { parseSearchRouteState, searchRouteParams } from "../searchState";

describe("search route state", () => {
  it("parses valid shareable filters", () => {
    expect(
      parseSearchRouteState({
        q: " Dune ",
        type: "movie",
        year: "2024",
        provider: "addon-1",
        sort: "year",
      }),
    ).toEqual({
      q: "Dune",
      type: "movie",
      year: "2024",
      provider: "addon-1",
      sort: "year",
      mode: undefined,
    });
  });

  it("normalizes invalid URL values", () => {
    expect(
      parseSearchRouteState({ type: "podcast", year: "24", sort: "popular" }),
    ).toEqual({
      q: "",
      type: "all",
      year: "all",
      provider: "all",
      sort: "relevance",
      mode: undefined,
    });
  });

  it("omits defaults when serializing", () => {
    expect(
      searchRouteParams({
        q: "Alien",
        type: "all",
        year: "all",
        provider: "all",
        sort: "relevance",
      }),
    ).toEqual({
      q: "Alien",
      type: undefined,
      year: undefined,
      provider: undefined,
      sort: undefined,
      mode: undefined,
    });
  });
});
