import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import LibraryScreen from "../library";

const mockNavigation = { setOptions: jest.fn() };
const mockRemove = { mutateAsync: jest.fn() };
const mockBulkRemove = { mutateAsync: jest.fn() };
const mockRemoveHistory = { mutateAsync: jest.fn() };
const mockClearHistory = { mutateAsync: jest.fn(), isPending: false };

const mockLibraryItems = [
  {
    id: "library-movie",
    userId: "user-1",
    itemId: "movie-1",
    type: "movie",
    title: "Example Movie",
    poster: null,
    addedAt: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "library-series",
    userId: "user-1",
    itemId: "series-1",
    type: "series",
    title: "Example Series",
    poster: null,
    addedAt: "2026-07-15T00:00:00.000Z",
  },
];

jest.mock("expo-router", () => ({
  useNavigation: () => mockNavigation,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../../../hooks/useLibrary", () => ({
  useLibrary: () => ({ data: mockLibraryItems, isLoading: false }),
  useRemoveFromLibrary: () => mockRemove,
  useRemoveBulkFromLibrary: () => mockBulkRemove,
}));

jest.mock("../../../hooks/useWatchHistory", () => ({
  useWatchHistory: () => ({
    items: [
      {
        id: "history-episode",
        userId: "user-1",
        itemId: "series-1",
        type: "series",
        season: 1,
        episode: 2,
        currentTime: 900,
        duration: 1200,
        title: "Watched Episode",
        poster: null,
        lastWatched: "2026-07-18T10:00:00.000Z",
      },
    ],
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
  }),
  useRemoveWatchHistoryEntry: () => mockRemoveHistory,
  useClearWatchHistory: () => mockClearHistory,
}));

jest.mock("../../../stores/authStore", () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: true }),
}));

jest.mock("../../../stores/downloadStore", () => ({
  useDownloadStore: (selector: (state: { tasks: object }) => unknown) =>
    selector({ tasks: {} }),
  isTaskOfflinePlayable: jest.fn(() => false),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      background: "#08090c",
      surfaceElevated: "#181b21",
      border: "#2a2d35",
      text: "#f4f5f7",
      tint: "#6c79f5",
    },
  }),
}));

jest.mock("../../../hooks/useWindowClass", () => ({
  useWindowClass: () => ({
    isCompact: false,
    windowClass: "large",
    width: 1440,
  }),
}));

jest.mock("../../../lib/haptics", () => ({
  hapticSelection: jest.fn(),
  hapticSuccess: jest.fn(),
}));

jest.mock("../../../components/catalog/ContinueWatchingRow", () => ({
  ContinueWatchingRow: () => null,
}));

jest.mock("../../../components/ui/SkeletonLoader", () => ({
  SkeletonCardGrid: () => null,
  SkeletonRow: () => null,
}));

jest.mock("../../../components/ui/EmptyState", () => {
  const { Text: MockText } = require("react-native");
  return {
    EmptyState: ({ title }: { title: string }) => <MockText>{title}</MockText>,
  };
});

jest.mock("../../../components/ui/ContentTabs", () => {
  const {
    Pressable: MockPressable,
    Text: MockText,
    View: MockView,
  } = require("react-native");
  return {
    ContentTabs: ({
      options,
      onChange,
    }: {
      options: { label: string; value: string }[];
      onChange: (value: string) => void;
    }) => (
      <MockView>
        {options.map((option) => (
          <MockPressable
            key={option.value}
            accessibilityLabel={`filter-${option.value}`}
            onPress={() => onChange(option.value)}
          >
            <MockText>{option.label}</MockText>
          </MockPressable>
        ))}
      </MockView>
    ),
  };
});

jest.mock("../../../components/library/LibraryCard", () => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    LibraryCard: ({
      item,
      selectionKey,
      isSelected,
      onToggleSelect,
      showRemoveButton,
      onRemove,
    }: {
      item: { title: string };
      selectionKey: string;
      isSelected: boolean;
      onToggleSelect: (key: string) => void;
      showRemoveButton?: boolean;
      onRemove?: (key: string) => void;
    }) => (
      <MockPressable
        accessibilityLabel={`card-${selectionKey}`}
        onPress={() => onToggleSelect(selectionKey)}
      >
        <MockText>{item.title}</MockText>
        {isSelected ? <MockText>Selected card</MockText> : null}
        {showRemoveButton && onRemove ? (
          <MockPressable
            accessibilityLabel={`remove-${selectionKey}`}
            onPress={() => onRemove(selectionKey.replace("history:", ""))}
          />
        ) : null}
      </MockPressable>
    ),
  };
});

jest.mock("../../../components/ui/PageHeader", () => {
  const { Text: MockText, View: MockView } = require("react-native");
  return {
    PageHeader: ({
      title,
      actions,
    }: {
      title: string;
      actions?: React.ReactNode;
    }) => (
      <MockView>
        <MockText>{title}</MockText>
        {actions}
      </MockView>
    ),
  };
});

jest.mock("../../../components/ui/AppButton", () => {
  const { Pressable: MockPressable, Text: MockText } = require("react-native");
  return {
    AppButton: ({
      label,
      accessibilityLabel,
      onPress,
    }: {
      label: string;
      accessibilityLabel?: string;
      onPress: () => void;
    }) => (
      <MockPressable
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={onPress}
      >
        <MockText>{label}</MockText>
      </MockPressable>
    ),
  };
});

jest.mock("../../../stores/toastStore", () => ({
  useToastStore: { getState: () => ({ show: jest.fn() }) },
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; defaultValue?: string }) => {
      const labels: Record<string, string> = {
        "tabs.library": "Library",
        "library.header.select": "Select",
        "library.header.cancel": "Cancel",
        "library.filters.all": "All",
        "library.filters.movies": "Movies",
        "library.filters.series": "Series",
        "library.filters.offline": "Offline",
        "library.filters.history": "History",
        "library.fab.delete": "Delete",
        "library.actions.manageDownloads": "Manage downloads",
        "library.history.clearAction": "Clear history",
      };
      if (key === "library.fab.selected")
        return `${options?.count ?? 0} selected`;
      return labels[key] ?? options?.defaultValue ?? key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: jest.fn() },
}));

describe("LibraryScreen selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("clears selection on Cancel and filter changes and disables selection offline", async () => {
    const screen = render(<LibraryScreen />);

    expect(screen.queryByText("0 selected")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();

    fireEvent.press(screen.getByText("Select"));
    fireEvent.press(screen.getByLabelText("card-library:library-movie"));
    expect(screen.getByText("1 selected")).toBeTruthy();

    fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("1 selected")).toBeNull();

    fireEvent.press(screen.getByText("Select"));
    fireEvent.press(screen.getByLabelText("card-library:library-series"));
    expect(screen.getByText("1 selected")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("filter-movie"));

    await waitFor(() => expect(screen.queryByText("1 selected")).toBeNull());
    expect(screen.getByText("Select")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("filter-offline"));
    await waitFor(() => expect(screen.queryByText("Select")).toBeNull());
    expect(screen.getByText("Manage downloads")).toBeTruthy();
  });

  it("keeps a separately paginated watch history accessible and confirms clearing it", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    const screen = render(<LibraryScreen />);

    fireEvent.press(screen.getByLabelText("filter-history"));

    await waitFor(() => {
      expect(screen.getByText("Watched Episode")).toBeTruthy();
      expect(screen.getByText("Clear history")).toBeTruthy();
      expect(screen.queryByText("Select")).toBeNull();
    });

    fireEvent.press(screen.getByText("Clear history"));
    expect(alertSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ style: "destructive" }),
      ]),
    );
    alertSpy.mockRestore();
  });
});
