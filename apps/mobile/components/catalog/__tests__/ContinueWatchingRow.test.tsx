import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { ContinueWatchingRow } from "../ContinueWatchingRow";

const mockPush = jest.fn();
const mockRemoveMutate = jest.fn();
const mockSetSessionStream = jest.fn();
const mockPlayBest = jest.fn();

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
jest.mock("../../../contexts/CinematicThemeContext", () => ({
  useCinematicTheme: () => ({ theme: { progress: "#d8b4fe" } }),
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

jest.mock("../../../services/playback/PlaybackOrchestrator", () => ({
  playBest: (...args: unknown[]) => mockPlayBest(...args),
}));

jest.mock("../../../stores/playerStore", () => ({
  usePlayerStore: (
    selector: (state: {
      setSessionStream: typeof mockSetSessionStream;
    }) => unknown,
  ) => selector({ setSessionStream: mockSetSessionStream }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const values: Record<string, string> = {
        "home.continueWatching.eyebrow": "Resume",
        "home.continueWatching.title": "Continue Watching",
        "home.continueWatching.movie": "Movie",
        "home.continueWatching.series": "Series",
        "common.actions.resume": "Resume",
        "library.actions.viewDetails": "View Details",
        "search.a11y.openDetails": "Open title details",
        "home.continueWatching.emptyTitle": "Nothing in progress",
        "home.continueWatching.emptyDescription":
          "Start a movie or episode and it will appear here.",
      };
      if (key === "home.continueWatching.remaining") {
        return `${options?.minutes}m left · ${options?.progress}%`;
      }
      if (key === "home.continueWatching.watched") {
        return `${options?.minutes}m watched`;
      }
      if (key === "home.continueWatching.removeA11y") {
        return `Remove ${options?.title} from Continue Watching`;
      }
      if (key === "home.continueWatching.resumeA11y") {
        return `Resume ${options?.title}, ${options?.minutes} minutes remaining`;
      }
      if (key === "home.continueWatching.moreActions") {
        return `More actions for ${options?.title}`;
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
    mockSetSessionStream.mockClear();
    mockPlayBest.mockReset();
    hooks.useRemoveProgress.mockReturnValue({
      mutate: mockRemoveMutate,
      isPending: false,
    });
    hooks.useUpdateProgress.mockReturnValue({
      mutateAsync: jest.fn(),
    });
  });

  it("uses three-up cinematic sizing on large desktop windows", () => {
    const rowModule = require("../ContinueWatchingRow");

    expect(rowModule.getContinueWatchingCardWidth?.("large")).toBe(400);
    expect(rowModule.getContinueWatchingCardWidth?.("compact")).toBe(270);
  });

  it("resumes directly through the planner and keeps details secondary", async () => {
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
          durationSource: "media",
          title: "Example Episode",
          poster: "https://images.example.test/poster.jpg",
          background: "https://images.example.test/backdrop.jpg",
          lastWatched: "2026-06-13T10:00:00.000Z",
        },
      ],
    });

    const screen = await render(<ContinueWatchingRow showEmptyState />);

    expect(screen.getByText("Continue Watching")).toBeTruthy();
    expect(screen.getByText("Example Episode")).toBeTruthy();
    expect(screen.getByText("S1 E2")).toBeTruthy();
    expect(screen.getByText("40m left · 33%")).toBeTruthy();
    expect(screen.getByText("Resume")).toBeTruthy();

    mockPlayBest.mockResolvedValue({
      ok: true,
      stream: { url: "https://example.test/video.mp4" },
      mediaInfo: {
        type: "series",
        itemId: "tt0903747",
        title: "Example Episode",
        poster: "https://images.example.test/poster.jpg",
        season: 1,
        episode: 2,
      },
      sessionId: "session-1",
      candidateId: "candidate-1",
    });

    await fireEvent.press(
      screen.getByLabelText("Resume Example Episode, 40 minutes remaining"),
    );

    await Promise.resolve();

    expect(mockPlayBest).toHaveBeenCalledWith({
      type: "series",
      id: "tt0903747",
      title: "Example Episode",
      poster: "https://images.example.test/poster.jpg",
      background: "https://images.example.test/backdrop.jpg",
      season: 1,
      episode: 2,
    });
    expect(mockSetSessionStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ itemId: "tt0903747" }),
      "session-1",
      "candidate-1",
      null,
      null,
      { type: "resume", positionSeconds: 1200 },
    );
    expect(mockPush).toHaveBeenCalledWith("/player");

    await fireEvent.press(
      screen.getAllByLabelText("View Details: Example Episode")[0],
    );
    expect(mockPush).toHaveBeenCalledWith("/detail/series/tt0903747");
  });

  it("removes an item from continue watching", async () => {
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
          durationSource: "media",
          title: "Example Movie",
          poster: null,
          lastWatched: "2026-06-13T10:00:00.000Z",
        },
      ],
    });

    const screen = await render(<ContinueWatchingRow />);

    await fireEvent.press(
      screen.getByLabelText("More actions for Example Movie"),
    );
    await fireEvent.press(
      screen.getByLabelText("Remove Example Movie from Continue Watching"),
    );

    expect(mockRemoveMutate).toHaveBeenCalledWith(
      "tt0111161",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("does not send movie persistence sentinels to the playback planner", async () => {
    hooks.useContinueWatching.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: "progress-movie",
          userId: "user-1",
          type: "movie",
          itemId: "tt0111161",
          season: 0,
          episode: 0,
          currentTime: 600,
          duration: 7200,
          durationSource: "metadata",
          title: "Example Movie",
          poster: null,
          lastWatched: "2026-07-27T10:00:00.000Z",
        },
      ],
    });
    mockPlayBest.mockResolvedValue({
      ok: true,
      stream: { url: "https://example.test/video.mp4" },
      mediaInfo: {
        type: "movie",
        itemId: "tt0111161",
        title: "Example Movie",
      },
      sessionId: "session-movie",
      candidateId: "candidate-movie",
    });

    const screen = await render(<ContinueWatchingRow />);
    await fireEvent.press(
      screen.getByLabelText("Resume Example Movie, 110 minutes remaining"),
    );
    await Promise.resolve();

    expect(screen.queryByText("S0 E0")).toBeNull();
    expect(mockPlayBest).toHaveBeenCalledWith({
      type: "movie",
      id: "tt0111161",
      title: "Example Movie",
      poster: undefined,
      season: undefined,
      episode: undefined,
    });
  });

  it("hides misleading percentages for legacy progress", async () => {
    hooks.useContinueWatching.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: "progress-legacy",
          userId: "user-1",
          type: "series",
          itemId: "tt11198330",
          season: 3,
          episode: 5,
          currentTime: 240,
          duration: 300,
          durationSource: "legacy",
          title: "Example Episode",
          poster: null,
          lastWatched: "2026-07-27T10:00:00.000Z",
        },
      ],
    });

    const screen = await render(<ContinueWatchingRow />);
    expect(screen.getByText("4m watched")).toBeTruthy();
    expect(screen.queryByText("1m left · 80%")).toBeNull();
  });

  it("can show a useful empty state on Home", async () => {
    hooks.useContinueWatching.mockReturnValue({
      isLoading: false,
      data: [],
    });

    const screen = await render(<ContinueWatchingRow showEmptyState />);

    expect(screen.getByText("Nothing in progress")).toBeTruthy();
    expect(
      screen.getByText("Start a movie or episode and it will appear here."),
    ).toBeTruthy();
  });
});
