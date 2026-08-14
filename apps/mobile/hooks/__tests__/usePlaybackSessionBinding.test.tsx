import { act, renderHook, waitFor } from "@testing-library/react-native";

import { usePlaybackSessionBinding } from "../usePlaybackSessionBinding";
import { getPlaybackLaunch } from "../../services/playback/PlaybackLaunchService";
import {
  advancePlaybackSessionAfterFailure,
  cancelPlaybackSession,
  resolvePlaybackSession,
} from "../../services/playback/PlaybackSessionPlaybackService";
import { playBest } from "../../services/playback/PlaybackOrchestrator";

const mockGetRuntimePlan = jest.fn();
const mockRemoveSession = jest.fn();

jest.mock("../../stores/playbackSessionStore", () => ({
  usePlaybackSessionStore: {
    getState: () => ({
      getRuntimePlan: mockGetRuntimePlan,
      removeSession: mockRemoveSession,
    }),
  },
}));

jest.mock("../../services/playback/PlaybackLaunchService", () => ({
  cancelPlaybackLaunch: jest.fn(),
  getPlaybackLaunch: jest.fn(),
  isPlaybackLaunchCancelled: jest.fn(() => false),
  releasePlaybackLaunch: jest.fn(),
}));

jest.mock("../../services/playback/PlaybackSessionPlaybackService", () => ({
  advancePlaybackSessionAfterFailure: jest.fn(),
  cancelPlaybackSession: jest.fn(),
  resolvePlaybackSession: jest.fn(),
}));

jest.mock("../../services/playback/PlaybackOrchestrator", () => ({
  playBest: jest.fn(),
}));

const mockedGetPlaybackLaunch = jest.mocked(getPlaybackLaunch);
const mockedCancelPlaybackSession = jest.mocked(cancelPlaybackSession);
const mockedAdvancePlaybackSessionAfterFailure = jest.mocked(
  advancePlaybackSessionAfterFailure,
);
const mockedResolvePlaybackSession = jest.mocked(resolvePlaybackSession);
const mockedPlayBest = jest.mocked(playBest);

const mediaInfo = {
  type: "movie" as const,
  itemId: "movie-1",
  title: "Example movie",
};

function createOptions(overrides: Record<string, unknown> = {}) {
  return {
    mediaInfo,
    planningLaunchId: null,
    playbackSessionId: null,
    playbackCandidateId: null,
    playbackAttemptId: null,
    playbackUri: null,
    setPlaybackUri: jest.fn(),
    setStreamStatus: jest.fn(),
    setRuntimeState: jest.fn(),
    setSessionStream: jest.fn(),
    advanceToNextFallback: jest.fn(() => null),
    setPlaybackPlanningFailure: jest.fn(),
    recordDiagnostic: jest.fn(),
    dispatchRuntimeViewEvent: jest.fn(),
    setFallbackStatusMessage: jest.fn(),
    setBuffering: jest.fn(),
    setPlaying: jest.fn(),
    setRuntimeFailure: jest.fn(),
    getFallbackStatusMessage: jest.fn(() => "Trying another source..."),
    abortSeekableHandoff: jest.fn(),
    requestLegacyFallback: jest.fn(),
    ...overrides,
  };
}

describe("usePlaybackSessionBinding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetPlaybackLaunch.mockReturnValue(null);
    mockedResolvePlaybackSession.mockResolvedValue({
      ok: false,
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "unavailable",
        retryable: true,
        shouldFallback: false,
      },
      runtimeState: "failed_source_unavailable",
      attemptedStreams: 0,
      resolveErrors: [],
    } as any);
    mockGetRuntimePlan.mockReturnValue({
      sourceDiscovery: { status: "partial" },
      orderedCandidates: [{ stream: { url: "old-source" } }],
    });
  });

  it("replans once and adopts only a genuinely new candidate", async () => {
    mockedPlayBest.mockResolvedValue({
      ok: true,
      stream: { url: "new-source" },
      mediaInfo,
      sessionId: "replacement-session",
      candidateId: "replacement-candidate",
      plan: {
        orderedCandidates: [{ stream: { url: "new-source" } }],
      },
    } as any);

    const options = createOptions();
    const { result } = await renderHook(() =>
      usePlaybackSessionBinding(options),
    );

    await act(async () => {
      await expect(
        result.current.tryReplanPartialPlayback("session-1"),
      ).resolves.toBe(true);
    });

    expect(mockedPlayBest).toHaveBeenCalledWith(
      expect.objectContaining({ type: "movie", id: "movie-1" }),
      expect.objectContaining({
        forceRefresh: true,
        awaitCompleteDiscovery: true,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mockedCancelPlaybackSession).toHaveBeenCalledWith(
      "session-1",
      "Trying sources returned after partial discovery.",
    );
    expect(options.setSessionStream).toHaveBeenCalledWith(
      { url: "new-source" },
      mediaInfo,
      "replacement-session",
      "replacement-candidate",
      null,
      null,
      { type: "play" },
    );
    expect(result.current.launchOwnedSessionIdRef.current).toBe(
      "replacement-session",
    );
  });

  it("cancels and removes a provisional session through one route-exit binding", async () => {
    const { result } = await renderHook(() =>
      usePlaybackSessionBinding(createOptions()),
    );
    result.current.launchOwnedSessionIdRef.current = "session-1";

    await act(() => {
      result.current.cancelOwnedPlayback("User left the player.", {
        removeSession: true,
      });
    });

    expect(mockedCancelPlaybackSession).toHaveBeenCalledWith(
      "session-1",
      "User left the player.",
    );
    expect(mockRemoveSession).toHaveBeenCalledWith("session-1");
    expect(result.current.getOwnedSessionId()).toBeNull();
  });

  it("advances a session fallback while preserving the pending continuity handoff", async () => {
    mockedAdvancePlaybackSessionAfterFailure.mockResolvedValue({
      ok: true,
      stream: { url: "fallback-source" },
      uri: "fallback-source",
      sessionId: "session-2",
      candidateId: "candidate-2",
      attemptId: "attempt-2",
      fallbackReason: "primary failed",
    } as any);
    const options = createOptions({
      playbackSessionId: "session-1",
      playbackCandidateId: "candidate-1",
      playbackAttemptId: "attempt-1",
      playbackUri: "primary-source",
    });
    const { result } = await renderHook(() =>
      usePlaybackSessionBinding(options),
    );

    await act(async () => {
      await expect(
        result.current.tryAdvanceToFallback({
          code: "SOURCE_UNAVAILABLE",
          message: "primary failed",
          retryable: true,
          shouldFallback: false,
        } as any),
      ).resolves.toBe(true);
    });

    expect(options.abortSeekableHandoff).toHaveBeenCalledTimes(1);
    expect(mockedAdvancePlaybackSessionAfterFailure).toHaveBeenCalledWith(
      "session-1",
      "candidate-1",
      "attempt-1",
      expect.objectContaining({ code: "SOURCE_UNAVAILABLE" }),
    );
    expect(options.setSessionStream).toHaveBeenCalledWith(
      { url: "fallback-source" },
      mediaInfo,
      "session-2",
      "candidate-2",
      "attempt-2",
      "primary failed",
    );
    expect(options.setPlaybackUri).toHaveBeenCalledWith("fallback-source");
    expect(result.current.fallbackInFlightRef.current).toBe(false);
  });

  it("reports an expired planning launch without creating a second session", async () => {
    const options = createOptions({ planningLaunchId: "expired-launch" });
    const { unmount } = await renderHook(() =>
      usePlaybackSessionBinding(options),
    );

    await waitFor(() =>
      expect(options.setPlaybackPlanningFailure).toHaveBeenCalledWith(
        "expired-launch",
        expect.objectContaining({ code: "SOURCE_UNAVAILABLE" }),
      ),
    );
    expect(mockedPlayBest).not.toHaveBeenCalled();
    await unmount();
  });
});
