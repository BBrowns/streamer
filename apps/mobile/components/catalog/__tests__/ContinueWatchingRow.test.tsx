import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { ContinueWatchingRow } from "../ContinueWatchingRow";

const mockPush = jest.fn();
const mockRemoveMutate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("expo-image", () => ({
  Image: "ExpoImage",
}));

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      tint: "#d8b4fe",
      card: "#22222d",
      text: "#ffffff",
      textSecondary: "#c7bfd5",
      border: "rgba(255,255,255,0.18)",
      error: "#ef4444",
      warning: "#f59e0b",
      success: "#22c55e",
    },
  }),
}));

jest.mock("../../../hooks/useWebPressableActivation", () => ({
  useWebPressableActivation: () => ({
    isKeyboardFocused: false,
    webPressableProps: {},
  }),
}));

jest.mock("../../../hooks/useContinueWatching", () => ({
  useContinueWatching: jest.fn(),
  useRemoveProgress: jest.fn(),
  useUpdateProgress: jest.fn(),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const values: Record<string, string> = {
        "home.continueWatching.eyebrow": "Resume",
        "home.continueWatching.title": "Continue Watching",
        "home.continueWatching.movie": "Movie",
        "home.continueWatching.series": "Series",
        "home.continueWatching.resume": "Resume",
        "home.continueWatching.emptyTitle": "Nothing in progress",
        "home.continueWatching.emptyDescription":
          "Start a movie or episode and it will appear here.",
      };
      if (key === "home.continueWatching.remaining") {
        return `${options?.minutes}m left · ${options?.progress}%`;
      }
      if (key === "home.continueWatching.removeA11y") {
        return `Remove ${options?.title} from Continue Watching`;
      }
      if (key === "home.continueWatching.resumeA11y") {
        return `Resume ${options?.title}, ${options?.minutes} minutes remaining`;
      }
      return values[key] ?? key;
    },
  }),
}));

const hooks = jest.requireMock("../../../hooks/useContinueWatching");

describe("ContinueWatchingRow", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRemoveMutate.mockClear();
    hooks.useRemoveProgress.mockReturnValue({
      mutate: mockRemoveMutate,
      isPending: false,
    });
    hooks.useUpdateProgress.mockReturnValue({
      mutateAsync: jest.fn(),
    });
  });

  it("renders resume cards with progress details", () => {
    hooks.useContinueWatching.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: "progress-1",
          userId: "user-1",
          type: "series",
          itemId: "tt0903747",
          season: 1,
          episode: 2,
          currentTime: 1200,
          duration: 3600,
          title: "Example Episode",
          poster: "https://images.example.test/poster.jpg",
          lastWatched: "2026-06-13T10:00:00.000Z",
        },
      ],
    });

    const screen = render(<ContinueWatchingRow showEmptyState />);

    expect(screen.getByText("Continue Watching")).toBeTruthy();
    expect(screen.getByText("Example Episode")).toBeTruthy();
    expect(screen.getByText("S1 E2")).toBeTruthy();
    expect(screen.getByText("40m left · 33%")).toBeTruthy();
  });

  it("removes an item from continue watching", () => {
    hooks.useContinueWatching.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: "progress-1",
          userId: "user-1",
          type: "movie",
          itemId: "tt0111161",
          season: null,
          episode: null,
          currentTime: 60,
          duration: 120,
          title: "Example Movie",
          poster: null,
          lastWatched: "2026-06-13T10:00:00.000Z",
        },
      ],
    });

    const screen = render(<ContinueWatchingRow />);

    fireEvent.press(
      screen.getByLabelText("Remove Example Movie from Continue Watching"),
    );

    expect(mockRemoveMutate).toHaveBeenCalledWith(
      "tt0111161",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("can show a useful empty state on Home", () => {
    hooks.useContinueWatching.mockReturnValue({
      isLoading: false,
      data: [],
    });

    const screen = render(<ContinueWatchingRow showEmptyState />);

    expect(screen.getByText("Nothing in progress")).toBeTruthy();
    expect(
      screen.getByText("Start a movie or episode and it will appear here."),
    ).toBeTruthy();
  });
});
