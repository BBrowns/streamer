import {
  clearSearchFilters,
  getSearchFilterPaginationState,
  getSearchOutcome,
  legacySearchRedirectParams,
  parseSearchRouteState,
  searchRouteParams,
} from "../searchState";

describe("search route state", () => {
  it("parses valid shareable filters", () => {
    expect(
      parseSearchRouteState({
        q: "  Dune   Part Two ",
        type: "movie",
        year: "2024",
        provider: "addon-1",
        sort: "year",
      }),
    ).toEqual({
      q: "Dune Part Two",
      type: "movie",
      year: "2024",
      provider: "addon-1",
      sort: "year",
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
    [0, true, 1, false, "ready"],
    [1, true, 1, false, "loading"],
    [1, false, 3, false, "ready"],
    [1, true, 20, false, "limit"],
    [1, true, 2, true, "error"],
  ])(
    "classifies complete secondary-filter pagination (%s, %s, %s, %s)",
    (
      activeSecondaryFilterCount,
      hasNextPage,
      pageCount,
      isNextPageError,
      expected,
    ) => {
      expect(
        getSearchFilterPaginationState({
          activeSecondaryFilterCount: Number(activeSecondaryFilterCount),
          hasNextPage: Boolean(hasNextPage),
          pageCount: Number(pageCount),
          isNextPageError: Boolean(isNextPageError),
        }),
      ).toBe(expected);
    },
  );

  it("supports a lower page cap for bounded pagination tests", () => {
    expect(
      getSearchFilterPaginationState({
        activeSecondaryFilterCount: 1,
        hasNextPage: true,
        pageCount: 2,
        isNextPageError: false,
        maxPageCount: 2,
      }),
    ).toBe("limit");
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

  it("classifies an empty server-side type slice as filter-empty when all types matched", () => {
    expect(
      getSearchOutcome({
        isLoading: false,
        isError: false,
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderCount: 0,
        resultCount: 0,
        filteredResultCount: 0,
        activeFilterCount: 1,
        unfilteredResultCount: 3,
      }),
    ).toBe("filter-empty");

    expect(
      getSearchOutcome({
        isLoading: false,
        isError: false,
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderCount: 0,
        resultCount: 0,
        filteredResultCount: 0,
        activeFilterCount: 1,
        unfilteredResultCount: 0,
      }),
    ).toBe("no-match");
  });
});
