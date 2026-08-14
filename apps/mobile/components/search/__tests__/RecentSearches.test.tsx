import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { RecentSearches } from "../RecentSearches";

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
    },
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { query?: string }) =>
      ({
        "search.recent.title": "Recent searches",
        "search.recent.clear": "Clear",
        "search.recent.open": `Search for ${values?.query}`,
        "search.recent.remove": `Remove ${values?.query}`,
        "search.command.noRecent": "No recent searches",
      })[key] ?? key,
  }),
}));

describe("RecentSearches", () => {
  it("renders a restrained page list with a four-item limit", async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <RecentSearches
        items={["Arrival", "Dune", "Severance", "Andor", "Silo"]}
        onSelect={onSelect}
        onClear={jest.fn()}
      />,
    );

    expect(screen.getByText("Recent searches")).toBeTruthy();
    expect(screen.queryByText("Silo")).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Search for Dune" }),
    );
    expect(onSelect).toHaveBeenCalledWith("Dune");
  });

  it("supports clear, per-row removal, and the compact empty state", async () => {
    const onClear = jest.fn();
    const onRemove = jest.fn();
    const screen = await render(
      <RecentSearches
        items={["Arrival"]}
        onSelect={jest.fn()}
        onClear={onClear}
        onRemove={onRemove}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Clear" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Remove Arrival" }),
    );
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith("Arrival");

    await screen.rerender(
      <RecentSearches
        variant="compact"
        items={[]}
        onSelect={jest.fn()}
        onClear={jest.fn()}
      />,
    );
    expect(screen.getByText("No recent searches")).toBeTruthy();
  });
});
