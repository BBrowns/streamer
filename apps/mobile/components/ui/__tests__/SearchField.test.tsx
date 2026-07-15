import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SearchField } from "../SearchField";

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
      card: "#111318",
      surfaceElevated: "#181B21",
      surfaceSubtle: "#0D0F13",
    },
  }),
}));

describe("SearchField", () => {
  it("keeps the shortcut inside an empty search field", () => {
    const screen = render(
      <SearchField
        value=""
        onChangeText={jest.fn()}
        onClear={jest.fn()}
        clearAccessibilityLabel="Clear search"
        accessibilityLabel="Search titles"
        shortcutHint="⌘K"
      />,
    );

    expect(screen.getByText("⌘K")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("offers one accessible clear action when a query is present", () => {
    const onClear = jest.fn();
    const screen = render(
      <SearchField
        value="Arrival"
        onChangeText={jest.fn()}
        onClear={onClear}
        clearAccessibilityLabel="Clear search"
        accessibilityLabel="Search titles"
        shortcutHint="⌘K"
      />,
    );

    expect(screen.queryByText("⌘K")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("offers a compact shared surface treatment", () => {
    const screen = render(
      <SearchField
        testID="catalog-search"
        variant="surface"
        value=""
        onChangeText={jest.fn()}
        onClear={jest.fn()}
        clearAccessibilityLabel="Clear search"
        accessibilityLabel="Search titles"
      />,
    );

    expect(screen.getByTestId("catalog-search")).toBeTruthy();
    expect(
      StyleSheet.flatten(
        screen.getByTestId("catalog-search-container").props.style,
      ),
    ).toMatchObject({
      minHeight: 50,
      borderWidth: 1,
      borderRadius: 10,
      backgroundColor: "#0D0F13",
    });
  });
});
