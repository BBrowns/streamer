import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import {
  FilterSheet,
  FilterSidebar,
  getRadioNavigationIndex,
} from "../SearchFilters";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      border: "#222",
      card: "#111",
      focus: "#88f",
      surfaceElevated: "#181818",
      text: "#fff",
      textSecondary: "#aaa",
      tint: "#77f",
    },
  }),
}));
jest.mock("../../../hooks/useWebPressableActivation", () => ({
  useWebPressableActivation: () => ({
    isKeyboardFocused: false,
    webPressableProps: {},
  }),
}));

describe("Search filters accessibility", () => {
  it("exposes radio choices through checked state", () => {
    const screen = render(
      <FilterSidebar
        years={[
          { label: "Any year", value: "all" },
          { label: "2026", value: "2026" },
        ]}
        providers={[{ label: "All sources", value: "all" }]}
        year="all"
        provider="all"
        sort="default"
        onYearChange={jest.fn()}
        onProviderChange={jest.fn()}
        onSortChange={jest.fn()}
        onReset={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("radio", { name: "Any year" }).props.accessibilityState,
    ).toEqual({ checked: true });
    expect(
      screen.getByRole("radio", { name: "2026" }).props.accessibilityState,
    ).toEqual({ checked: false });
  });

  it("uses standard wrapped radio-group keyboard navigation", () => {
    expect(getRadioNavigationIndex(0, 3, "ArrowUp")).toBe(2);
    expect(getRadioNavigationIndex(2, 3, "ArrowDown")).toBe(0);
    expect(getRadioNavigationIndex(1, 3, "Home")).toBe(0);
    expect(getRadioNavigationIndex(1, 3, "End")).toBe(2);
  });

  it("keeps the filter panel separate from its dismissible scrim", () => {
    const onClose = jest.fn();
    const screen = render(
      <FilterSheet
        visible
        onClose={onClose}
        years={[{ label: "Any year", value: "all" }]}
        providers={[{ label: "All sources", value: "all" }]}
        year="all"
        provider="all"
        sort="default"
        onYearChange={jest.fn()}
        onProviderChange={jest.fn()}
        onSortChange={jest.fn()}
        onReset={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByRole("radio", { name: "search.sort.default" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(
      screen.getByTestId("search-filter-scrim", {
        includeHiddenElements: true,
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
