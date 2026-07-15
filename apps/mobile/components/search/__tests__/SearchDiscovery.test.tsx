import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import type { InstalledAddon, MetaPreview } from "@streamer/shared";
import { SearchDiscovery } from "../SearchDiscovery";

const mockPush = jest.fn();
const mockUseAddons = jest.fn();
const mockUseAddonCatalog = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("../../../hooks/useAddons", () => ({
  useAddons: () => mockUseAddons(),
}));

jest.mock("../../../hooks/useAddonCatalog", () => ({
  useAddonCatalog: (...args: unknown[]) => mockUseAddonCatalog(...args),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      card: "#111318",
      text: "#F4F5F7",
      textSecondary: "#9DA3AE",
      tint: "#6C79F5",
    },
  }),
}));

const translations: Record<string, string> = {
  "search.discovery.noProvidersTitle": "Add a content source",
  "search.discovery.noProvidersDescription":
    "Install an add-on to search and browse movies and series.",
  "search.discovery.manageAddons": "Manage add-ons",
  "search.discovery.noCatalogsTitle": "No catalogs for this view",
  "search.discovery.noCatalogsDescription":
    "Your installed add-ons do not offer catalogs for the selected title type.",
  "search.discovery.catalogErrorTitle": "Catalog unavailable",
  "search.discovery.catalogErrorDescription":
    "This catalog could not be loaded. Try again.",
  "search.discovery.inlineCatalogError":
    "Provider could not load this catalog.",
  "common.retry": "Retry",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

jest.mock("../../ui/AppButton", () => {
  const { Pressable, Text } = require("react-native");
  return {
    AppButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

jest.mock("../../ui/EmptyState", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    EmptyState: ({
      title,
      description,
      actionLabel,
      onAction,
    }: {
      title: string;
      description?: string;
      actionLabel?: string;
      onAction?: () => void;
    }) => (
      <View>
        <Text>{title}</Text>
        {description ? <Text>{description}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction}>
            <Text>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});

jest.mock("../SearchResultCard", () => {
  const { Text } = require("react-native");
  return {
    SearchResultCard: ({ item }: { item: MetaPreview }) => (
      <Text>{item.name}</Text>
    ),
  };
});

function addon(
  id: string,
  catalogs: InstalledAddon["manifest"]["catalogs"],
): InstalledAddon {
  return {
    id,
    userId: "user-1",
    transportUrl: `https://example.com/${id}`,
    installedAt: "2026-07-14T12:00:00.000Z",
    manifest: {
      id: `manifest-${id}`,
      version: "1.0.0",
      name: `Provider ${id}`,
      description: "Fixture provider",
      resources: ["catalog"],
      types: ["movie", "series"],
      catalogs,
    },
  };
}

const readyCatalog = (items: MetaPreview[] = []) => ({
  data: { pages: [items] },
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
});

describe("SearchDiscovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAddons.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseAddonCatalog.mockReturnValue(readyCatalog());
  });

  it("offers add-on setup only when no providers are installed", () => {
    const screen = render(<SearchDiscovery type="all" />);

    expect(screen.getByText("Add a content source")).toBeTruthy();
    expect(screen.queryByText("No catalogs for this view")).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Manage add-ons" }));
    expect(mockPush).toHaveBeenCalledWith("/addons");
  });

  it("distinguishes an installed provider without a catalog for the selected type", () => {
    mockUseAddons.mockReturnValue({
      data: [
        addon("series-only", [
          { id: "popular-series", type: "series", name: "Popular series" },
        ]),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = render(<SearchDiscovery type="movie" />);

    expect(screen.getByTestId("search-discovery-no-catalogs")).toBeTruthy();
    expect(screen.getByText("No catalogs for this view")).toBeTruthy();
    expect(screen.queryByText("Add a content source")).toBeNull();
    expect(mockUseAddonCatalog).not.toHaveBeenCalled();
  });

  it("shows retryable consumer errors when every catalog rail fails", () => {
    const movieRetry = jest.fn();
    const seriesRetry = jest.fn();
    mockUseAddons.mockReturnValue({
      data: [
        addon("catalogs", [
          { id: "popular-movies", type: "movie", name: "Popular movies" },
          { id: "popular-series", type: "series", name: "Popular series" },
        ]),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseAddonCatalog.mockImplementation(
      (_addonId: string, catalog: { id: string }) => ({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: catalog.id === "popular-movies" ? movieRetry : seriesRetry,
      }),
    );

    const screen = render(<SearchDiscovery type="all" />);

    expect(
      screen.getAllByText("Provider could not load this catalog."),
    ).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(2);
    fireEvent.press(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(movieRetry).toHaveBeenCalledTimes(1);
    expect(seriesRetry).not.toHaveBeenCalled();
  });

  it("keeps healthy discovery content visible beside a failed rail", () => {
    mockUseAddons.mockReturnValue({
      data: [
        addon("mixed", [
          { id: "popular-movies", type: "movie", name: "Popular movies" },
          { id: "popular-series", type: "series", name: "Popular series" },
        ]),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseAddonCatalog.mockImplementation(
      (_addonId: string, catalog: { id: string }) =>
        catalog.id === "popular-movies"
          ? readyCatalog([
              {
                id: "movie-1",
                type: "movie",
                name: "Healthy result",
                poster: "https://example.com/poster.jpg",
              },
            ])
          : {
              data: undefined,
              isLoading: false,
              isError: true,
              refetch: jest.fn(),
            },
    );

    const screen = render(<SearchDiscovery type="all" />);

    expect(screen.getByText("Healthy result")).toBeTruthy();
    expect(
      screen.getByText("Provider could not load this catalog."),
    ).toBeTruthy();
  });
});
