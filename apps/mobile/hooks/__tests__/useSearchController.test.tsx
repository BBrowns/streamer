import { useLayoutEffect } from "react";
import { act, renderHook } from "@testing-library/react-native";
import { useGlobalSearch } from "../useGlobalSearch";
import { useSearchController } from "../useSearchController";

jest.mock("../useGlobalSearch", () => ({
  useGlobalSearch: jest.fn(),
}));

const staleResult = {
  id: "dune",
  type: "movie" as const,
  name: "Dune",
  poster: "",
  providerIds: ["catalog"],
  providerNames: ["Catalog"],
};

describe("useSearchController", () => {
  it("does not expose or announce results from a superseded query", () => {
    (useGlobalSearch as jest.Mock).mockReturnValue({
      data: { metas: [staleResult] },
      debouncedQuery: "Dune",
      isDebouncing: true,
      isFetching: false,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useSearchController({ initialQuery: "Alien" }),
    );

    expect(result.current.state).toBe("loading-suggestions");
    expect(result.current.suggestions).toEqual([]);
  });

  it("suppresses duplicate suggestion work for the submitted query", () => {
    (useGlobalSearch as jest.Mock).mockReturnValue({
      data: undefined,
      debouncedQuery: "",
      isDebouncing: false,
      isFetching: false,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useSearchController({
        initialQuery: "Dune",
        suppressedSuggestionQuery: "Dune",
      }),
    );

    expect(useGlobalSearch).toHaveBeenLastCalledWith("Dune", {
      enabled: false,
    });
    expect(result.current.state).not.toBe("loading-suggestions");
    expect(result.current.suggestions).toEqual([]);
  });

  it("classifies bounded results without provider failures as truncated, not partial", () => {
    (useGlobalSearch as jest.Mock).mockReturnValue({
      data: {
        metas: [staleResult],
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderIds: [],
        partial: false,
        truncated: true,
      },
      debouncedQuery: "Dune",
      isDebouncing: false,
      isFetching: false,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useSearchController({ initialQuery: "Dune" }),
    );

    expect(result.current.state).toBe("truncated-results");
  });

  it("uses partial provider copy only when provider failures are present", () => {
    (useGlobalSearch as jest.Mock).mockReturnValue({
      data: {
        metas: [staleResult],
        attemptedProviders: 2,
        successfulProviders: 1,
        failedProviderIds: ["offline-addon"],
        partial: true,
        truncated: true,
      },
      debouncedQuery: "Dune",
      isDebouncing: false,
      isFetching: false,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useSearchController({ initialQuery: "Dune" }),
    );

    expect(result.current.state).toBe("partial-results");
  });

  it("exposes keyboard selection synchronously for a rapid Enter press", () => {
    (useGlobalSearch as jest.Mock).mockReturnValue({
      data: {
        metas: [staleResult],
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderIds: [],
        partial: false,
        truncated: false,
      },
      debouncedQuery: "Dune",
      isDebouncing: false,
      isFetching: false,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() =>
      useSearchController({ initialQuery: "Dune" }),
    );

    act(() => {
      result.current.moveSelection("next");
    });

    expect(result.current.getSelectionSnapshot()).toEqual({
      selectedIndex: 0,
      deliberatelyNavigated: true,
    });
  });

  it("preserves keyboard selection when navigation races the suggestion reset effect", () => {
    (useGlobalSearch as jest.Mock).mockReturnValue({
      data: {
        metas: [staleResult],
        attemptedProviders: 1,
        successfulProviders: 1,
        failedProviderIds: [],
        partial: false,
        truncated: false,
      },
      debouncedQuery: "Dune",
      isDebouncing: false,
      isFetching: false,
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => {
      const controller = useSearchController({ initialQuery: "Dune" });

      // Browser input can arrive after the suggestions commit but before the
      // passive selection-reset effect for that commit has been flushed.
      useLayoutEffect(() => {
        if (controller.suggestions.length > 0) {
          controller.moveSelection("next");
        }
      }, [controller.moveSelection, controller.suggestions.length]);

      return controller;
    });

    expect(result.current.getSelectionSnapshot()).toEqual({
      selectedIndex: 0,
      deliberatelyNavigated: true,
    });
  });
});
