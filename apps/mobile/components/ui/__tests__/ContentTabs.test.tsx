import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { ContentTabs } from "../ContentTabs";

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
});
