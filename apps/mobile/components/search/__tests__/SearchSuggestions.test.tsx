import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SearchSuggestions } from "../SearchSuggestions";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      border: "#2B2E35",
      focus: "#8E98FF",
      text: "#F4F5F7",
      textSecondary: "#9DA3AE",
      tint: "#6C79F5",
      warning: "#F3B85B",
    },
  }),
}));

jest.mock("../SearchResultCard", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    SearchResultCard: ({ item, onPress }: any) => (
      <Pressable testID={`suggestion-${item.id}`} onPress={onPress}>
        <Text>{item.name}</Text>
      </Pressable>
    ),
  };
});

const ITEMS = [
  {
    id: "dune-1",
    type: "movie" as const,
    name: "Dune",
    poster: "",
    providerIds: ["catalog"],
    providerNames: ["Catalog"],
  },
  {
    id: "dune-2",
    type: "series" as const,
    name: "Dune: Prophecy",
    poster: "",
    providerIds: ["catalog"],
    providerNames: ["Catalog"],
  },
];

describe("SearchSuggestions", () => {
  it("renders shared suggestions and the final all-results row", () => {
    const onSelect = jest.fn();
    const onShowAll = jest.fn();
    const screen = render(
      <SearchSuggestions
        testID="suggestion-list"
        variant="palette"
        query="Dune"
        items={ITEMS}
        state="suggestions"
        selectedIndex={1}
        onSelect={onSelect}
        onShowAll={onShowAll}
        onRetry={jest.fn()}
        onManageAddons={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId("suggestion-dune-2"));
    fireEvent.press(
      screen.getByRole("button", { name: "search.suggestions.showAll" }),
    );
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
    expect(onShowAll).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("search-suggestion-series-dune-2").props
        .accessibilityState,
    ).toEqual({ selected: true });
    expect(
      screen.getByTestId("search-suggestion-movie-dune-1").props
        .accessibilityState,
    ).toEqual({ selected: false });
    expect(
      screen.getByTestId("search-suggestion-announcement").props.children,
    ).toBe("Dune: Prophecy");
    expect(
      StyleSheet.flatten(screen.getByTestId("suggestion-list").props.style),
    ).toMatchObject({ maxHeight: 400 });
  });

  it("visibly selects and announces the all-results row", () => {
    const screen = render(
      <SearchSuggestions
        query="Dune"
        items={ITEMS}
        state="suggestions"
        selectedIndex={ITEMS.length}
        onSelect={jest.fn()}
        onShowAll={jest.fn()}
        onRetry={jest.fn()}
        onManageAddons={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId("search-suggestion-all-results").props
        .accessibilityState,
    ).toEqual({ selected: true });
    expect(
      screen.getByTestId("search-suggestion-announcement").props.children,
    ).toBe("search.suggestions.showAll");
  });

  it("offers add-on management for the no-searchable-provider state", () => {
    const onManageAddons = jest.fn();
    const screen = render(
      <SearchSuggestions
        query="Dune"
        items={[]}
        state="no-search-provider"
        onSelect={jest.fn()}
        onShowAll={jest.fn()}
        onRetry={jest.fn()}
        onManageAddons={onManageAddons}
      />,
    );

    fireEvent.press(
      screen.getByRole("button", { name: "search.discovery.manageAddons" }),
    );
    expect(onManageAddons).toHaveBeenCalledTimes(1);
  });

  it("keeps a zero-item partial response explicit and retryable", () => {
    const onRetry = jest.fn();
    const screen = render(
      <SearchSuggestions
        query="Dune"
        items={[]}
        state="partial-results"
        onSelect={jest.fn()}
        onShowAll={jest.fn()}
        onRetry={onRetry}
        onManageAddons={jest.fn()}
      />,
    );

    expect(screen.getByText("search.states.partialCompact")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "common.retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("uses neutral bounded-result copy when no provider failed", () => {
    const screen = render(
      <SearchSuggestions
        query="Dune"
        items={ITEMS}
        state="truncated-results"
        onSelect={jest.fn()}
        onShowAll={jest.fn()}
        onRetry={jest.fn()}
        onManageAddons={jest.fn()}
      />,
    );

    expect(screen.getByText("search.states.truncatedCompact")).toBeTruthy();
    expect(screen.queryByText("search.states.partialCompact")).toBeNull();
    expect(screen.queryByRole("button", { name: "common.retry" })).toBeNull();
  });
});
