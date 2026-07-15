import {
  clearSearchFilters,
  getSearchOutcome,
  legacySearchRedirectParams,
  parseSearchRouteState,
  searchRouteParams,
} from "../searchState";

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
      sort: "default",
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
        sort: "default",
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

  it("normalizes the legacy relevance alias to the default sort", () => {
    expect(parseSearchRouteState({ sort: "relevance" }).sort).toBe("default");
    expect(
      legacySearchRedirectParams({ q: "Dune", sort: "relevance" }),
    ).toMatchObject({ q: "Dune", sort: undefined });
  });

  it("clears every filter including provider", () => {
    expect(clearSearchFilters()).toEqual({
      type: "all",
      year: "all",
      provider: "all",
      sort: "default",
    });
  });

  it.each([
    [{ isLoading: true }, "loading"],
    [{ isError: true }, "transport-error"],
    [{ attemptedProviders: 0 }, "no-providers"],
    [
      { attemptedProviders: 2, successfulProviders: 0, failedProviderCount: 2 },
      "provider-error",
    ],
    [{ resultCount: 0 }, "no-match"],
    [{ filteredResultCount: 0, activeFilterCount: 1 }, "filter-empty"],
  ])("classifies distinct search outcomes", (overrides, expected) => {
    expect(
      getSearchOutcome({
        isLoading: false,
        isError: false,
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderCount: 0,
        resultCount: 1,
        filteredResultCount: 1,
        activeFilterCount: 0,
        ...overrides,
      }),
    ).toBe(expected);
  });
});
