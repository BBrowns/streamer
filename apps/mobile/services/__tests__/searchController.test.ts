import {
  SEARCH_DEBOUNCE_MS,
  createSearchDebouncer,
  getSearchSelectionDirection,
  getSearchShortcutLabel,
  isCurrentSearchQuery,
  moveSearchSelection,
  normalizeSearchQueryInput,
  resolveCommandPaletteAction,
  shouldShowSearchSuggestions,
} from "../searchController";

describe("search debouncer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("waits 250 ms and emits only the latest query", () => {
    const onReady = jest.fn();
    const controller = createSearchDebouncer(onReady);

    controller.update("du");
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(onReady).not.toHaveBeenCalled();

    controller.update("dune");
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith("dune");
  });

  it("cancels pending work and clears terms shorter than two characters", () => {
    const onReady = jest.fn();
    const controller = createSearchDebouncer(onReady);

    controller.update("alien");
    controller.cancel();
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(onReady).not.toHaveBeenCalled();

    controller.update("a");
    expect(onReady).toHaveBeenCalledWith("");
  });

  it("wraps command-palette keyboard selection in both directions", () => {
    expect(moveSearchSelection(-1, 3, "next")).toBe(0);
    expect(moveSearchSelection(-1, 3, "previous")).toBe(2);
    expect(moveSearchSelection(2, 3, "next")).toBe(0);
    expect(moveSearchSelection(0, 3, "previous")).toBe(2);
    expect(moveSearchSelection(0, 0, "next")).toBe(-1);
  });

  it("shares arrow navigation without turning Enter into a selection action", () => {
    expect(getSearchSelectionDirection("ArrowDown")).toBe("next");
    expect(getSearchSelectionDirection("ArrowUp")).toBe("previous");
    expect(getSearchSelectionDirection("Enter")).toBeUndefined();
    expect(getSearchSelectionDirection("Escape")).toBeUndefined();
  });

  it("normalizes spacing without changing meaningful title characters", () => {
    expect(normalizeSearchQueryInput("  Spider-Man:   No Way Home  ")).toBe(
      "Spider-Man: No Way Home",
    );
    expect(normalizeSearchQueryInput("Amélie")).toBe("Amélie");
    expect(isCurrentSearchQuery("Dune   Part Two", " Dune Part Two ")).toBe(
      true,
    );
    expect(isCurrentSearchQuery("Dune Part Two", "Dune")).toBe(false);
  });

  it("uses the platform-appropriate quick-search shortcut", () => {
    expect(getSearchShortcutLabel("MacIntel")).toBe("⌘K");
    expect(getSearchShortcutLabel("Win32")).toBe("Ctrl K");
    expect(getSearchShortcutLabel("Linux x86_64")).toBe("Ctrl K");
  });

  it("does not reopen suggestions for a spacing-only edit of the submitted query", () => {
    expect(
      shouldShowSearchSuggestions(
        "Dune   Part Two",
        "Dune Part Two",
        "no-results",
      ),
    ).toBe(false);
    expect(
      shouldShowSearchSuggestions("Dune Messiah", "Dune", "suggestions"),
    ).toBe(true);
  });

  it("opens all results by default and a title only after deliberate navigation", () => {
    expect(
      resolveCommandPaletteAction({
        deliberatelyNavigated: false,
        selectedIndex: -1,
        suggestionCount: 3,
      }),
    ).toEqual({ kind: "all-results" });
    expect(
      resolveCommandPaletteAction({
        deliberatelyNavigated: false,
        selectedIndex: 0,
        suggestionCount: 3,
      }),
    ).toEqual({ kind: "all-results" });
    expect(
      resolveCommandPaletteAction({
        deliberatelyNavigated: true,
        selectedIndex: 1,
        suggestionCount: 3,
      }),
    ).toEqual({ kind: "suggestion", index: 1 });
    expect(
      resolveCommandPaletteAction({
        deliberatelyNavigated: true,
        selectedIndex: 3,
        suggestionCount: 3,
      }),
    ).toEqual({ kind: "all-results" });
  });
});
