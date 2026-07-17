import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";
import { ContentTabs, getContentTabNavigationIndex } from "../ContentTabs";

const mockHapticSelection = jest.fn();

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      text: "#F4F5F7",
      textSecondary: "#9DA3AE",
      tint: "#6C79F5",
      focus: "#8E98FF",
      card: "#111318",
      border: "#2B2E35",
      surfaceElevated: "#181B21",
    },
  }),
}));

jest.mock("../../../lib/haptics", () => ({
  hapticSelection: () => mockHapticSelection(),
}));

describe("ContentTabs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exposes the selected tab and changes peer content views", () => {
    const onChange = jest.fn();
    const screen = render(
      <ContentTabs
        accessibilityLabel="Catalog type"
        options={[
          { label: "All", value: "all" },
          { label: "Movies", value: "movie" },
          { label: "Series", value: "series" },
        ]}
        value="all"
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("Catalog type").props.accessibilityRole).toBe(
      "tablist",
    );
    expect(
      screen.getByRole("tab", { name: "All" }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      screen.getByRole("tab", { name: "Movies" }).props.accessibilityState,
    ).toEqual({ selected: false });
    expect(screen.getByTestId("content-tab-indicator-all")).toBeTruthy();

    fireEvent.press(screen.getByRole("tab", { name: "Movies" }));

    expect(onChange).toHaveBeenCalledWith("movie");
    expect(mockHapticSelection).toHaveBeenCalledTimes(1);
  });

  it("renders the same accessible tabs as a compact segmented selector", () => {
    const screen = render(
      <ContentTabs
        testID="catalog-type-tabs"
        variant="segmented"
        accessibilityLabel="Content type"
        options={[
          { label: "All", value: "all" },
          { label: "Movies", value: "movie" },
          { label: "Series", value: "series" },
        ]}
        value="movie"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByTestId("catalog-type-tabs")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(
      screen.getByRole("tab", { name: "Movies" }).props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      StyleSheet.flatten(
        screen.getByRole("tab", { name: "Movies" }).props.style,
      ),
    ).toMatchObject({ minHeight: 44, width: 90 });
    expect(screen.queryByTestId("content-tab-indicator-movie")).toBeNull();
  });

  it("uses roving tab stops and activates the next tab with arrow keys on web", () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });
    const onChange = jest.fn();
    const screen = render(
      <ContentTabs
        accessibilityLabel="Content type"
        options={[
          { label: "All", value: "all" },
          { label: "Movies", value: "movie" },
          { label: "Series", value: "series" },
        ]}
        value="movie"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("tab", { name: "All" }).props.tabIndex).toBe(-1);
    expect(screen.getByRole("tab", { name: "Movies" }).props.tabIndex).toBe(0);
    fireEvent(screen.getByRole("tab", { name: "Movies" }), "keyDown", {
      key: "ArrowRight",
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    });
    expect(onChange).toHaveBeenCalledWith("series");

    screen.unmount();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalOS,
    });
  });

  it("calculates wraparound and boundary tab navigation", () => {
    expect(getContentTabNavigationIndex(0, 3, "ArrowLeft")).toBe(2);
    expect(getContentTabNavigationIndex(2, 3, "ArrowRight")).toBe(0);
    expect(getContentTabNavigationIndex(1, 3, "Home")).toBe(0);
    expect(getContentTabNavigationIndex(1, 3, "End")).toBe(2);
    expect(getContentTabNavigationIndex(1, 3, "Enter")).toBeNull();
  });
});
