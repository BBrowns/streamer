import {
  SEARCH_DEBOUNCE_MS,
  createSearchDebouncer,
  moveSearchSelection,
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
    expect(moveSearchSelection(2, 3, "next")).toBe(0);
    expect(moveSearchSelection(0, 3, "previous")).toBe(2);
    expect(moveSearchSelection(0, 0, "next")).toBe(-1);
  });
});
