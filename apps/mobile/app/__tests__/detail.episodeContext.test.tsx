import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import DetailScreen from "../detail/[type]/[id]";

let mockParams: Record<string, string>;
let mockLayoutProps: any;
let mockDesktop = false;
let mockVideos: Array<{
  id: string;
  title: string;
  season: number;
  episode: number;
}>;
const mockPrefetch = jest.fn();
const mockLaunch = jest.fn(() => "launch");
const mockPush = jest.fn();
const mockPlanning = jest.fn();
const mockDownload = jest.fn().mockResolvedValue(undefined);
const mockPrepareDownload = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));
jest.mock("../../hooks/useMeta", () => ({
  useMeta: () => ({
    data: { id: "series", type: "series", name: "Series", videos: mockVideos },
  }),
}));
jest.mock("../../hooks/useStreams", () => ({
  useStreams: () => ({ data: [] }),
}));
jest.mock("../../hooks/useLibrary", () => ({
  useIsInLibrary: () => ({}),
  useAddToLibrary: () => ({}),
  useRemoveFromLibrary: () => ({}),
}));
jest.mock("../../hooks/useWindowClass", () => ({
  useWindowClass: () => ({ isExpanded: mockDesktop }),
}));
jest.mock("../../stores/playerStore", () => ({
  usePlayerStore: (selector: any) =>
    selector({
      setPlaybackPlanning: mockPlanning,
      setSessionStream: jest.fn(),
    }),
}));
jest.mock("../../stores/downloadStore", () => ({}));
jest.mock("../../stores/castStore", () => ({}));
jest.mock("../../stores/toastStore", () => ({
  useToastStore: { getState: () => ({ show: jest.fn() }) },
}));
jest.mock("../../stores/smartDownloadStore", () => ({
  useSmartDownloadStore: {
    getState: () => ({ preferences: { enabled: false } }),
  },
}));
jest.mock("../../services/DownloadService", () => ({
  downloadService: {
    startDownload: (...args: unknown[]) => mockDownload(...args),
  },
}));
jest.mock("../../services/SmartDownloadPlanner", () => ({}));
jest.mock("../../services/playback/PlaybackLaunchService", () => ({
  beginPlaybackLaunch: (...args: unknown[]) => mockLaunch(...args),
}));
jest.mock("../../services/playback/PlaybackPlanService", () => ({
  prefetchPlaybackPlan: (...args: unknown[]) => mockPrefetch(...args),
}));
jest.mock("../../services/playback/PlaybackOrchestrator", () => ({
  prepareDownload: (...args: unknown[]) => mockPrepareDownload(...args),
}));
jest.mock("../../components/DesktopCastModal", () => ({
  DesktopCastModal: () => null,
}));
jest.mock("../../components/detail/DetailLoadState", () => ({
  DetailLoadState: () => null,
}));
jest.mock("../../components/detail/PlaybackReadinessNotice", () => ({}));
jest.mock("../../components/detail/DesktopDetailLayout", () => ({
  DesktopDetailLayout: (props: any) => {
    mockLayoutProps = props;
    return null;
  },
}));
jest.mock("../../components/detail/MobileDetailLayout", () => ({
  MobileDetailLayout: (props: any) => {
    mockLayoutProps = props;
    return null;
  },
}));
jest.mock("../../lib/haptics", () => ({
  hapticImpactLight: jest.fn(),
  hapticSuccess: jest.fn(),
}));

const videos = [
  { id: "s0e2", season: 0, episode: 2, title: "Second special" },
  { id: "s0e1", season: 0, episode: 1, title: "First special" },
  { id: "s1e3", season: 1, episode: 3, title: "Third episode" },
  { id: "s1e1", season: 1, episode: 1, title: "First episode" },
];

describe("Detail episode context", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockParams = { type: "series", id: "series" };
    mockVideos = videos;
    mockDesktop = false;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([false, true])(
    "prefetches the regular default for desktop=%s",
    async (desktop) => {
      mockDesktop = desktop;
      await render(<DetailScreen />);
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(mockPrefetch).toHaveBeenCalledWith(
        { type: "series", id: "series", season: 1, episode: 1, action: "play" },
        expect.anything(),
      );
    },
  );

  it("prefetches the first special for specials-only metadata", async () => {
    mockVideos = videos.filter((video) => video.season === 0);
    await render(<DetailScreen />);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockPrefetch).toHaveBeenCalledWith(
      expect.objectContaining({ season: 0, episode: 1 }),
      expect.anything(),
    );
  });

  it("prefetches the exact recovery episode and launches that episode without changing coordinates", async () => {
    mockParams = { ...mockParams, season: "0", episode: "2", sources: "1" };
    await render(<DetailScreen />);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockPrefetch).toHaveBeenCalledWith(
      expect.objectContaining({ season: 0, episode: 2 }),
      expect.anything(),
    );
    await act(async () => {
      await mockLayoutProps.handlePlayStream("Second special", 0, 2);
    });
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        season: 0,
        episode: 2,
        episodeTitle: "Second special",
      }),
    );
    expect(mockPlanning).toHaveBeenCalledWith(
      expect.objectContaining({ season: 0, episode: 2 }),
      "launch",
    );
    expect(mockPush).toHaveBeenCalledWith("/player");
  });

  it("adds season zero to direct download file-selection hints", async () => {
    await render(<DetailScreen />);
    const stream = {
      url: "https://example.test/video",
      fileSelectionHints: { filename: "Special.mkv" },
    };
    await act(async () => {
      await mockLayoutProps.handleDownloadStream(
        stream,
        "Second special",
        0,
        2,
      );
    });
    expect(mockDownload).toHaveBeenCalledWith(
      {
        ...stream,
        fileSelectionHints: { filename: "Special.mkv", season: 0, episode: 2 },
      },
      expect.objectContaining({ season: 0, episode: 2 }),
    );
    expect(stream.fileSelectionHints).toEqual({ filename: "Special.mkv" });
  });

  it("prepares the special's download through PlaybackSession", async () => {
    const result = {
      ok: true,
      stream: { url: "https://example.test/video" },
      mediaInfo: { type: "series", itemId: "series", season: 0, episode: 2 },
      sessionId: "session",
      candidateId: "candidate",
      attemptId: "attempt",
      plan: {},
    };
    mockPrepareDownload.mockResolvedValue(result);
    await render(<DetailScreen />);
    await act(async () => {
      await mockLayoutProps.handleDownloadStream(
        undefined,
        "Second special",
        0,
        2,
      );
    });
    expect(mockPrepareDownload).toHaveBeenCalledWith(
      expect.objectContaining({ season: 0, episode: 2 }),
    );
    expect(mockDownload).toHaveBeenCalledWith(
      result.stream,
      result.mediaInfo,
      expect.objectContaining({
        playbackSession: {
          sessionId: "session",
          candidateId: "candidate",
          attemptId: "attempt",
        },
      }),
    );
  });

  it.each([
    [-1, 1],
    [0.5, 1],
    [0, -1],
    [0, 1.5],
  ])(
    "does not plan, play or download invalid coordinates %s/%s",
    async (season, episode) => {
      mockVideos = [];
      mockDesktop = true;
      await render(<DetailScreen />);
      await act(async () => {
        mockLayoutProps.onPlayIntent(season, episode);
        await mockLayoutProps.handlePlayStream("Invalid", season, episode);
        await mockLayoutProps.handleDownloadStream(
          undefined,
          "Invalid",
          season,
          episode,
        );
        jest.advanceTimersByTime(600);
      });
      expect(mockPrefetch).not.toHaveBeenCalled();
      expect(mockLaunch).not.toHaveBeenCalled();
      expect(mockPrepareDownload).not.toHaveBeenCalled();
      expect(mockDownload).not.toHaveBeenCalled();
    },
  );
});
