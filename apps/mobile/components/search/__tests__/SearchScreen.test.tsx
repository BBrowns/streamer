import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SearchScreen } from "../SearchScreen";

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockMoveSelection = jest.fn();
const mockResetSelection = jest.fn();
const mockRememberSearch = jest.fn().mockResolvedValue(true);
let mockRouteParams: Record<string, string> = {};
let mockInfiniteSearchResult: any;

const suggestion = {
  id: "dune",
  type: "movie" as const,
  name: "Dune",
  poster: "",
  providerIds: ["catalog"],
  providerNames: ["Catalog"],
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
}));

jest.mock("../../../hooks/useSearchController", () => ({
  useSearchController: () => ({
    query: "Dune",
    setQuery: jest.fn(),
    clearQuery: jest.fn(),
    recentSearches: [],
    rememberSearch: mockRememberSearch,
    removeRecentSearch: jest.fn(),
    clearRecentSearches: jest.fn(),
    suggestions: [suggestion],
    suggestionSearch: { refetch: jest.fn() },
    state: "suggestions",
    selectedIndex: 1,
    moveSelection: mockMoveSelection,
    resetSelection: mockResetSelection,
  }),
}));

jest.mock("../../../hooks/useSearch", () => ({
  useInfiniteSearch: () => mockInfiniteSearchResult,
  useSearch: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      background: "#000",
      border: "#222",
      card: "#111",
      focus: "#88f",
      surfaceElevated: "#111",
      text: "#fff",
      textSecondary: "#aaa",
      tint: "#77f",
      warning: "#fa0",
    },
  }),
}));

jest.mock("../../../hooks/useWindowClass", () => ({
  useWindowClass: () => ({ width: 390, isCompact: true, isLarge: false }),
}));

jest.mock("../../../hooks/useWebPressableActivation", () => ({
  useWebPressableActivation: () => ({
    isKeyboardFocused: false,
    webPressableProps: {},
  }),
}));

jest.mock("../../../lib/haptics", () => ({ hapticImpactLight: jest.fn() }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("../../ui/PageLayout", () => {
  const { View } = require("react-native");
  return {
    PageLayout: ({ children, testID, scroll, boundary, contained }: any) => (
      <View
        testID={testID}
        accessibilityLabel={`scroll:${String(scroll)} boundary:${String(
          boundary,
        )} contained:${String(contained)}`}
      >
        {children}
      </View>
    ),
  };
});
jest.mock("../../ui/ContentBoundary", () => {
  const { View } = require("react-native");
  return {
    ContentBoundary: ({ children, size = "content" }: any) => (
      <View testID={`content-boundary-${size}`}>{children}</View>
    ),
  };
});
jest.mock("../../ui/PageHeader", () => {
  const { Text } = require("react-native");
  return {
    PageHeader: ({ testID, title, titleVisibility }: any) => (
      <Text testID={testID} accessibilityLabel={titleVisibility}>
        {titleVisibility === "visible" ? title : null}
      </Text>
    ),
  };
});
jest.mock("../../ui/ContentTabs", () => ({ ContentTabs: () => null }));
jest.mock("../../ui/EmptyState", () => {
  const { Text } = require("react-native");
  return { EmptyState: ({ title }: any) => <Text>{title}</Text> };
});
jest.mock("../../ui/SearchField", () => {
  const { TextInput } = require("react-native");
  return {
    SearchField: ({
      testID,
      onKeyPress,
      onSubmitEditing,
      onFocus,
      onBlur,
      onChangeText,
    }: any) => (
      <TextInput
        testID={testID}
        onKeyPress={onKeyPress}
        onSubmitEditing={onSubmitEditing}
        onFocus={onFocus}
        onBlur={onBlur}
        onChangeText={onChangeText}
      />
    ),
  };
});

jest.mock("../SearchDiscovery", () => ({ SearchDiscovery: () => null }));
jest.mock("../SearchFilters", () => ({
  FilterSheet: () => null,
  FilterSidebar: () => null,
}));
jest.mock("../SearchResultCard", () => {
  const { Text } = require("react-native");
  return {
    SearchResultCard: ({ item }: any) => (
      <Text testID={`result-${item.type}-${item.id}`}>{item.name}</Text>
    ),
  };
});
jest.mock("../SearchSuggestions", () => {
  const { Pressable, Text, View } = require("react-native");
  return {
    SearchSuggestions: ({ selectedIndex, items, onSelect }: any) => (
      <View>
        <Text testID="selected-suggestion-index">{selectedIndex}</Text>
        <Pressable
          testID="mock-search-suggestion"
          onPress={() => onSelect(items[0])}
        />
      </View>
    ),
  };
});

describe("SearchScreen keyboard behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRememberSearch.mockResolvedValue(true);
    mockRouteParams = {};
    mockInfiniteSearchResult = {
      data: undefined,
      pageCount: 0,
      hasNextPage: false,
      isLoading: false,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      isError: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    };
  });

  it("lets the compact tab header own the page title", async () => {
    const screen = await render(<SearchScreen />);

    expect(screen.queryByText("search.title")).toBeNull();
    expect(
      screen.getByTestId("search-page-header").props.accessibilityLabel,
    ).toBe("navigation-owned");
    expect(screen.getByTestId("search-field")).toBeTruthy();
  });

  it("keeps a single results scroller inside explicit content boundaries", async () => {
    const screen = await render(<SearchScreen />);

    expect(screen.getByTestId("search-screen").props.accessibilityLabel).toBe(
      "scroll:undefined boundary:false contained:undefined",
    );
    expect(screen.getAllByTestId("content-boundary-content")).toHaveLength(2);
    expect(
      screen.root?.queryAll((node) => node.type === "RCTScrollView"),
    ).toHaveLength(1);
  });

  it("moves shared suggestion selection with arrows and exposes the index", async () => {
    const screen = await render(<SearchScreen />);

    await fireEvent(screen.getByTestId("search-field"), "focus");

    await fireEvent(screen.getByTestId("search-field"), "keyPress", {
      nativeEvent: { key: "ArrowDown" },
      preventDefault: jest.fn(),
    });
    await fireEvent(screen.getByTestId("search-field"), "keyPress", {
      nativeEvent: { key: "ArrowUp" },
      preventDefault: jest.fn(),
    });

    expect(mockMoveSelection).toHaveBeenNthCalledWith(1, "next");
    expect(mockMoveSelection).toHaveBeenNthCalledWith(2, "previous");
    expect(screen.getByTestId("selected-suggestion-index").props.children).toBe(
      1,
    );
  });

  it("always opens all results on Enter even with a selected suggestion", async () => {
    const screen = await render(<SearchScreen />);

    await fireEvent(screen.getByTestId("search-field"), "submitEditing");

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/search",
      params: {
        q: "Dune",
        type: undefined,
        year: undefined,
        provider: undefined,
        genre: undefined,
        language: undefined,
        sort: undefined,
      },
    });
    expect(mockPush).not.toHaveBeenCalledWith("/detail/movie/dune");
  });

  it("navigates before recent-search persistence finishes", async () => {
    let resolvePersistence!: (value: boolean) => void;
    mockRememberSearch.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolvePersistence = resolve;
      }),
    );
    const screen = await render(<SearchScreen />);

    await fireEvent(screen.getByTestId("search-field"), "submitEditing");

    expect(mockRememberSearch).toHaveBeenCalledWith("Dune");
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/search" }),
    );
    resolvePersistence(true);
  });

  it("dismisses full-page suggestions on Escape", async () => {
    const screen = await render(<SearchScreen />);
    const field = screen.getByTestId("search-field");
    await fireEvent(field, "focus");
    expect(screen.getByTestId("search-suggestions")).toBeTruthy();

    await fireEvent(field, "keyPress", {
      nativeEvent: { key: "Escape" },
      preventDefault: jest.fn(),
    });

    expect(screen.queryByTestId("search-suggestions")).toBeNull();
    expect(mockResetSelection).toHaveBeenCalled();

    await fireEvent.changeText(field, "Dune again");
    expect(screen.getByTestId("search-suggestions")).toBeTruthy();
  });

  it("keeps suggestions actionable during the delayed blur dismissal", async () => {
    jest.useFakeTimers();
    const screen = await render(<SearchScreen />);
    const field = screen.getByTestId("search-field");
    await fireEvent(field, "focus");
    await fireEvent(field, "blur");

    await fireEvent.press(screen.getByTestId("mock-search-suggestion"));

    expect(mockPush).toHaveBeenCalledWith("/detail/movie/dune");
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("keeps cached results visible while a background refetch fails", async () => {
    mockRouteParams = { q: "Dune" };
    mockInfiniteSearchResult = searchResultState({
      isFetching: true,
      isError: true,
    });

    const screen = await render(<SearchScreen />);

    expect(screen.getByTestId("search-results-grid")).toBeTruthy();
    expect(screen.getByTestId("result-movie-dune")).toBeTruthy();
    expect(screen.queryByText("search.states.errorTitle")).toBeNull();
  });

  it("shows a transport error when only an empty cached response remains", async () => {
    mockRouteParams = { q: "Dune" };
    mockInfiniteSearchResult = searchResultState({
      data: {
        ...searchResultState().data,
        metas: [],
        total: 0,
      },
      isFetching: true,
      isError: true,
    });

    const screen = await render(<SearchScreen />);

    expect(screen.getByText("search.states.errorTitle")).toBeTruthy();
    expect(screen.queryByTestId("search-results-grid")).toBeNull();
  });

  it("keeps page-one results and exposes inline retry after page-two failure", async () => {
    mockRouteParams = { q: "Dune" };
    const fetchNextPage = jest.fn();
    mockInfiniteSearchResult = searchResultState({
      isError: true,
      isFetchNextPageError: true,
      hasNextPage: true,
      fetchNextPage,
    });

    const screen = await render(<SearchScreen />);

    expect(screen.getByTestId("search-results-grid")).toBeTruthy();
    const retry = screen.getByTestId("search-load-more");
    expect(retry.props.accessibilityLabel).toBe("common.retry");
    await fireEvent.press(retry);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

function searchResultState(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      metas: [suggestion],
      total: 1,
      providers: [{ id: "catalog", name: "Catalog" }],
      providersByContent: { "movie:dune": ["catalog"] },
      attemptedProviders: 1,
      successfulProviders: 1,
      failedProviderIds: [],
      partial: false,
      truncated: false,
    },
    pageCount: 1,
    hasNextPage: false,
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isError: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    ...overrides,
  };
}
