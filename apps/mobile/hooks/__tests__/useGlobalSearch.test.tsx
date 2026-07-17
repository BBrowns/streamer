import { act, renderHook } from "@testing-library/react-native";
import { SEARCH_DEBOUNCE_MS } from "../../services/searchController";
import { useGlobalSearch } from "../useGlobalSearch";
import { useSearch } from "../useSearch";

const mockCancelQueries = jest.fn().mockResolvedValue(undefined);

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ cancelQueries: mockCancelQueries }),
}));

jest.mock("../useSearch", () => ({
  useSearch: jest.fn(() => ({ data: undefined, isFetching: false })),
}));

describe("useGlobalSearch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it("does not debounce or request suggestions while explicitly disabled", () => {
    const { result } = renderHook(() =>
      useGlobalSearch("Dune", { enabled: false }),
    );

    act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(result.current.isDebouncing).toBe(false);
    expect(useSearch).toHaveBeenLastCalledWith("", {
      minimumLength: 2,
      limit: 6,
      mode: "suggestions",
      type: "all",
      enabled: false,
    });
  });

  it("uses normalized query identity for debounce state", () => {
    const { result } = renderHook(() => useGlobalSearch("Dune   Part Two"));

    act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

    expect(useSearch).toHaveBeenLastCalledWith("Dune Part Two", {
      minimumLength: 2,
      limit: 6,
      mode: "suggestions",
      type: "all",
      enabled: undefined,
    });
    expect(result.current.isDebouncing).toBe(false);
  });

  it("cancels the superseded request before the replacement debounce elapses", () => {
    const { rerender } = renderHook(
      ({ query }: { query: string }) => useGlobalSearch(query),
      { initialProps: { query: "Dune" } },
    );
    act(() => jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    mockCancelQueries.mockClear();

    rerender({ query: "Alien" });

    expect(mockCancelQueries).toHaveBeenCalledWith({
      queryKey: ["search", "Dune", "suggestions", "all"],
    });
    expect(useSearch).toHaveBeenLastCalledWith("Dune", expect.any(Object));
  });
});
