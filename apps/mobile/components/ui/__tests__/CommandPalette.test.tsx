import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { CommandPalette } from "../CommandPalette";
import { useSearchController } from "../../../hooks/useSearchController";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      border: "#2B2E35",
      focus: "#8E98FF",
      text: "#F4F5F7",
      textSecondary: "#9DA3AE",
      tint: "#6C79F5",
      surfaceElevated: "#181B21",
    },
  }),
}));

jest.mock("../../../hooks/useSearchController", () => ({
  useSearchController: jest.fn(),
}));

jest.mock("../../search/RecentSearches", () => ({
  RecentSearches: () => null,
}));

jest.mock("../../search/SearchSuggestions", () => ({
  SearchSuggestions: () => null,
}));

const suggestion = {
  id: "dune",
  type: "movie" as const,
  name: "Dune",
  poster: "",
  providerIds: ["catalog"],
  providerNames: ["Catalog"],
};

function controller(overrides: Record<string, unknown> = {}) {
  const selectedIndex = (overrides.selectedIndex as number | undefined) ?? -1;
  const deliberatelyNavigated =
    (overrides.deliberatelyNavigated as boolean | undefined) ?? false;
  return {
    query: "Dune",
    setQuery: jest.fn(),
    clearQuery: jest.fn(),
    recentSearches: [],
    rememberSearch: jest.fn().mockResolvedValue(true),
    clearRecentSearches: jest.fn(),
    suggestions: [suggestion],
    suggestionSearch: { refetch: jest.fn() },
    state: "suggestions",
    selectedIndex,
    deliberatelyNavigated,
    moveSelection: jest.fn(),
    getSelectionSnapshot: jest.fn(() => ({
      selectedIndex,
      deliberatelyNavigated,
    })),
    ...overrides,
  };
}

describe("CommandPalette", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("opens all results on Enter before deliberate arrow navigation", async () => {
    (useSearchController as jest.Mock).mockReturnValue(controller());
    const screen = render(<CommandPalette visible onClose={jest.fn()} />);

    fireEvent(screen.getByTestId("command-search-field"), "submitEditing");
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/search",
        params: { q: "Dune" },
      }),
    );
  });

  it("opens the highlighted title after deliberate keyboard navigation", async () => {
    (useSearchController as jest.Mock).mockReturnValue(
      controller({ selectedIndex: 0, deliberatelyNavigated: true }),
    );
    const screen = render(<CommandPalette visible onClose={jest.fn()} />);

    fireEvent(screen.getByTestId("command-search-field"), "submitEditing");
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/detail/movie/dune"),
    );
  });

  it.each([
    ["ArrowDown", "next"],
    ["ArrowUp", "previous"],
  ])("moves the shared selection on %s", (key, direction) => {
    const moveSelection = jest.fn();
    (useSearchController as jest.Mock).mockReturnValue(
      controller({ moveSelection }),
    );
    const screen = render(<CommandPalette visible onClose={jest.fn()} />);

    fireEvent(screen.getByTestId("command-search-field"), "keyPress", {
      nativeEvent: { key },
      preventDefault: jest.fn(),
    });

    expect(moveSelection).toHaveBeenCalledWith(direction);
  });

  it("closes and navigates before recent-search persistence finishes", () => {
    let resolvePersistence!: (value: boolean) => void;
    const rememberSearch = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePersistence = resolve;
        }),
    );
    const onClose = jest.fn();
    (useSearchController as jest.Mock).mockReturnValue(
      controller({ rememberSearch }),
    );
    const screen = render(<CommandPalette visible onClose={onClose} />);

    fireEvent(screen.getByTestId("command-search-field"), "submitEditing");

    expect(rememberSearch).toHaveBeenCalledWith("Dune");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/search",
      params: { q: "Dune" },
    });
    resolvePersistence(true);
  });

  it("does not treat clicks inside the palette as backdrop dismissal", () => {
    const onClose = jest.fn();
    (useSearchController as jest.Mock).mockReturnValue(controller());
    const screen = render(<CommandPalette visible onClose={onClose} />);

    fireEvent.press(screen.getByTestId("command-search-field"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.press(
      screen.getByTestId("command-palette-backdrop", {
        includeHiddenElements: true,
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
