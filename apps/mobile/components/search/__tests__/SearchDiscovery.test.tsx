import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { InstalledAddon } from "@streamer/shared";
import {
  buildSearchDiscoveryCatalogRows,
  SearchDiscovery,
} from "../SearchDiscovery";

const mockRefetch = jest.fn();
let mockAddonsResult: any;

const catalogAddon: InstalledAddon = {
  id: "catalog-addon",
  userId: "user",
  transportUrl: "https://catalog.example/manifest.json",
  installedAt: "2026-01-01T00:00:00.000Z",
  manifest: {
    id: "catalog.example",
    version: "1.0.0",
    name: "Catalog source",
    description: "A fixture catalog source",
    resources: ["catalog"],
    types: ["movie", "series"],
    catalogs: [
      { type: "movie", id: "editorial-movies", name: "Editorial movies" },
      {
        type: "series",
        id: "drama-series",
        name: "Drama series",
        extra: [{ name: "genre", options: ["Drama"] }],
      },
      {
        type: "movie",
        id: "title-search",
        name: "Title search",
        extra: [{ name: "search", isRequired: true }],
      },
      {
        type: "series",
        id: "requires-genre",
        name: "Requires genre",
        extra: [{ name: "genre", isRequired: true, options: ["Comedy"] }],
      },
    ],
  },
};

jest.mock("../../../hooks/useAddons", () => ({
  useAddons: () => mockAddonsResult,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      border: "#222",
      text: "#fff",
      textSecondary: "#aaa",
      tint: "#77f",
    },
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "search.types.all": "All",
        "search.types.moviePlural": "Movies",
        "search.types.seriesPlural": "Series",
        "search.discovery.title": "Browse your catalogs",
        "search.discovery.subtitle": "From your installed add-ons.",
        "search.filters.contentType": "Content type",
        "search.filters.type": "Filter by title type",
        "search.discovery.noProvidersTitle": "Add a content source",
        "search.discovery.noProvidersDescription": "Install an add-on.",
        "search.discovery.noCatalogsTitle": "No catalogs for this view",
        "search.discovery.noCatalogsDescription": "No catalogs match.",
        "search.discovery.manageAddons": "Manage add-ons",
        "search.states.errorTitle": "Search could not load",
        "search.states.errorDescription": "Try again.",
        "common.retry": "Retry",
      })[key] ?? key,
  }),
}));

jest.mock("../../catalog/CatalogRow", () => {
  const { Text } = require("react-native");
  return {
    CatalogRow: ({ catalog }: any) => (
      <Text testID={`catalog-row-${catalog.id}`}>{catalog.name}</Text>
    ),
  };
});

jest.mock("../../ui/ContentTabs", () => {
  const { Pressable, View } = require("react-native");
  return {
    ContentTabs: ({ options, value, onChange, accessibilityLabel }: any) => (
      <View accessibilityLabel={accessibilityLabel}>
        {options.map((option: any) => (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: option.value === value }}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    ),
  };
});

jest.mock("../../ui/EmptyState", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    EmptyState: ({ title, actionLabel, onAction }: any) => (
      <View>
        <Text>{title}</Text>
        {actionLabel ? (
          <Pressable accessibilityRole="button" onPress={onAction}>
            <Text>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});

jest.mock("../RecentSearches", () => {
  const { Text } = require("react-native");
  return {
    RecentSearches: ({ items }: any) => (
      <Text testID="mock-recent-searches">{items.join(",")}</Text>
    ),
  };
});

describe("SearchDiscovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddonsResult = {
      data: [catalogAddon],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
  });

  it("uses only installed browseable catalogs and respects required extras", () => {
    expect(
      buildSearchDiscoveryCatalogRows([catalogAddon], "all").map(
        ({ catalog }) => catalog.id,
      ),
    ).toEqual(["editorial-movies", "drama-series"]);
    expect(
      buildSearchDiscoveryCatalogRows([catalogAddon], "series").map(
        ({ catalog }) => catalog.id,
      ),
    ).toEqual(["drama-series"]);
  });

  it("shows real catalog rows and keeps recent searches secondary", () => {
    const screen = render(
      <SearchDiscovery
        recentSearches={["Dune"]}
        onSelectRecentSearch={jest.fn()}
        onRemoveRecentSearch={jest.fn()}
        onClearRecentSearches={jest.fn()}
        onManageAddons={jest.fn()}
      />,
    );

    expect(screen.getByTestId("catalog-row-editorial-movies")).toBeTruthy();
    expect(screen.getByTestId("catalog-row-drama-series")).toBeTruthy();
    expect(screen.getByTestId("mock-recent-searches")).toBeTruthy();
  });

  it("filters the visible catalog rows through the compact type tabs", () => {
    const screen = render(
      <SearchDiscovery
        recentSearches={[]}
        onSelectRecentSearch={jest.fn()}
        onRemoveRecentSearch={jest.fn()}
        onClearRecentSearches={jest.fn()}
        onManageAddons={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByRole("tab", { name: "Movies" }));

    expect(screen.getByTestId("catalog-row-editorial-movies")).toBeTruthy();
    expect(screen.queryByTestId("catalog-row-drama-series")).toBeNull();
    expect(screen.queryByTestId("mock-recent-searches")).toBeNull();
  });

  it("offers add-on management when no browseable catalog is installed", () => {
    const onManageAddons = jest.fn();
    mockAddonsResult = {
      data: [],
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    const screen = render(
      <SearchDiscovery
        recentSearches={[]}
        onSelectRecentSearch={jest.fn()}
        onRemoveRecentSearch={jest.fn()}
        onClearRecentSearches={jest.fn()}
        onManageAddons={onManageAddons}
      />,
    );

    fireEvent.press(screen.getByRole("button", { name: "Manage add-ons" }));
    expect(onManageAddons).toHaveBeenCalledTimes(1);
  });
});
