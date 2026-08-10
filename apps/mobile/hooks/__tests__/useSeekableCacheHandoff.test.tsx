import { act, renderHook, waitFor } from "@testing-library/react-native";

import { replaceWithSeekableSource } from "../../components/player/seekablePlaybackHandoff";
import { markPlaybackSessionPlaying } from "../../services/playback/PlaybackSessionPlaybackService";
import { usePlayerStore } from "../../stores/playerStore";
import { usePlaybackSessionStore } from "../../stores/playbackSessionStore";
import { useSeekableCacheHandoff } from "../useSeekableCacheHandoff";

jest.mock("../../components/player/seekablePlaybackHandoff", () => ({
  replaceWithSeekableSource: jest.fn(),
}));

jest.mock("../../services/playback/PlaybackSessionPlaybackService", () => ({
  markPlaybackSessionPlaying: jest.fn(),
}));

const mockedReplaceWithSeekableSource = jest.mocked(replaceWithSeekableSource);
const mockedMarkPlaybackSessionPlaying = jest.mocked(
  markPlaybackSessionPlaying,
);

const SESSION_ID = "session-1";
const CANDIDATE_ID = "candidate-1";
const ATTEMPT_ID = "attempt-1";
const GATEWAY_JOB_ID = "gateway-job-1";

function installCurrentOwnership() {
  usePlayerStore.setState({
    currentStream: {
      url: "runtime-source",
      behaviorHints: { remuxStrategy: "progressive-fmp4" },
    },
    playbackSessionId: SESSION_ID,
    playbackCandidateId: CANDIDATE_ID,
    playbackAttemptId: ATTEMPT_ID,
  });
  usePlaybackSessionStore.setState({
    sessions: {
      [SESSION_ID]: {
        id: SESSION_ID,
        selectedCandidateId: CANDIDATE_ID,
        status: "playing",
      } as any,
    },
    activeSessionId: SESSION_ID,
  });
}

function createOptions() {
  const player = {
    currentTime: 42,
    playing: true,
    play: jest.fn(),
    pause: jest.fn(),
    replaceAsync: jest.fn(),
  };
  const getSeekablePlaybackHandoff = jest.fn();
  const controllerRef = { current: null as AbortController | null };
  const handoffInFlightRef = { current: false };
  const handoffShouldResumeRef = { current: null as boolean | null };
  const pausedAfterHandoffRef = { current: false };
  const options = {
    player,
    playbackUri: "runtime-source",
    engine: { getSeekablePlaybackHandoff } as any,
    isProgressiveRemuxPlayback: true,
    hasPlaybackStarted: true,
    playbackSessionId: SESSION_ID,
    playbackCandidateId: CANDIDATE_ID,
    playbackAttemptId: ATTEMPT_ID,
    playbackDelivery: "progressive-fmp4" as const,
    activeCast: null,
    seekableHandoffApplied: false,
    preparedBridgeJobId: GATEWAY_JOB_ID,
    activeGatewayJobId: "older-gateway-job",
    controllerRef,
    handoffInFlightRef,
    handoffShouldResumeRef,
    pausedAfterHandoffRef,
    setSeekableCacheStatus: jest.fn(),
    setSeekableHandoffApplied: jest.fn(),
    recordDiagnostic: jest.fn(),
    dispatchRuntimeViewEvent: jest.fn(),
    setBuffering: jest.fn(),
    setPlaying: jest.fn(),
    setRuntimeState: jest.fn(),
    setStreamStatus: jest.fn(),
    beginProgressSourceReplacement: jest.fn(),
    completeProgressSourceReplacement: jest.fn(),
  };
  return { options, getSeekablePlaybackHandoff };
}

describe("useSeekableCacheHandoff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReplaceWithSeekableSource.mockResolvedValue(undefined);
    installCurrentOwnership();
  });

  afterEach(() => {
    jest.useRealTimers();
    usePlaybackSessionStore.setState({ sessions: {}, activeSessionId: null });
    usePlayerStore.setState({
      currentStream: null,
      playbackSessionId: null,
      playbackCandidateId: null,
      playbackAttemptId: null,
    });
  });

  it("polls the exact prepared job and completes one in-attempt handoff", async () => {
    jest.useFakeTimers();
    const { options, getSeekablePlaybackHandoff } = createOptions();
    getSeekablePlaybackHandoff
      .mockResolvedValueOnce({
        gatewayJobId: GATEWAY_JOB_ID,
        status: "preparing",
      })
      .mockResolvedValueOnce({
        gatewayJobId: GATEWAY_JOB_ID,
        status: "ready",
        uri: "seekable-runtime-source",
      });

    const { unmount } = renderHook(() => useSeekableCacheHandoff(options));
    await act(async () => {
      await Promise.resolve();
    });

    expect(getSeekablePlaybackHandoff).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        expectedGatewayJobId: GATEWAY_JOB_ID,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(options.setSeekableCacheStatus).toHaveBeenCalledWith("preparing");

    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getSeekablePlaybackHandoff).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expectedGatewayJobId: GATEWAY_JOB_ID,
      }),
    );
    expect(mockedReplaceWithSeekableSource).toHaveBeenCalledWith({
      player: options.player,
      source: "seekable-runtime-source",
      resumeAt: 42,
      shouldResume: true,
      signal: expect.any(AbortSignal),
    });
    expect(options.beginProgressSourceReplacement).toHaveBeenCalledTimes(1);
    expect(options.completeProgressSourceReplacement).toHaveBeenCalledWith(42);
    expect(options.setSeekableHandoffApplied).toHaveBeenCalledWith(true);
    expect(options.recordDiagnostic.mock.calls.map(([event]) => event)).toEqual(
      [
        { type: "seekable_handoff", state: "ready" },
        { type: "seekable_handoff", state: "started" },
        { type: "seekable_handoff", state: "completed" },
      ],
    );
    expect(options.dispatchRuntimeViewEvent.mock.calls).toEqual([
      [
        {
          type: "source_replacement_started",
          reason: "seekable_handoff",
          resumeAt: 42,
        },
      ],
      [{ type: "source_replacement_completed" }],
    ]);
    expect(options.handoffInFlightRef.current).toBe(false);
    expect(options.handoffShouldResumeRef.current).toBeNull();
    expect(options.pausedAfterHandoffRef.current).toBe(false);

    const signal = getSeekablePlaybackHandoff.mock.calls[0][0]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(options.controllerRef.current).toBeNull();
  });

  it("keeps live playback healthy when source replacement fails", async () => {
    const replacementError = new Error("replacement failed");
    mockedReplaceWithSeekableSource.mockRejectedValueOnce(replacementError);
    const { options, getSeekablePlaybackHandoff } = createOptions();
    getSeekablePlaybackHandoff.mockResolvedValueOnce({
      gatewayJobId: GATEWAY_JOB_ID,
      status: "ready",
      uri: "seekable-runtime-source",
    });

    renderHook(() => useSeekableCacheHandoff(options));

    await waitFor(() =>
      expect(options.recordDiagnostic).toHaveBeenLastCalledWith({
        type: "seekable_handoff",
        state: "unavailable",
      }),
    );
    expect(options.setSeekableHandoffApplied).not.toHaveBeenCalled();
    expect(options.setSeekableCacheStatus).toHaveBeenLastCalledWith(
      "unavailable",
    );
    expect(options.setBuffering).toHaveBeenLastCalledWith(false);
    expect(options.setPlaying).toHaveBeenLastCalledWith(true);
    expect(options.setStreamStatus).toHaveBeenLastCalledWith("playing");
    expect(mockedMarkPlaybackSessionPlaying).toHaveBeenCalledWith(SESSION_ID);
    expect(options.completeProgressSourceReplacement).toHaveBeenCalledTimes(1);
    expect(options.dispatchRuntimeViewEvent).toHaveBeenLastCalledWith({
      type: "source_replacement_completed",
    });
  });

  it.each([
    [
      "player attempt",
      () => usePlayerStore.setState({ playbackAttemptId: "attempt-2" }),
    ],
    [
      "selected session candidate",
      () =>
        usePlaybackSessionStore.setState((state) => ({
          sessions: {
            ...state.sessions,
            [SESSION_ID]: {
              ...state.sessions[SESSION_ID],
              selectedCandidateId: "candidate-2",
            },
          },
        })),
    ],
    [
      "terminal session",
      () =>
        usePlaybackSessionStore.setState((state) => ({
          sessions: {
            ...state.sessions,
            [SESSION_ID]: {
              ...state.sessions[SESSION_ID],
              status: "cancelled",
            },
          },
        })),
    ],
  ])(
    "ignores a ready result after %s ownership changes",
    async (_label, invalidate) => {
      let resolveHandoff!: (value: {
        gatewayJobId: string;
        status: "ready";
        uri: string;
      }) => void;
      const { options, getSeekablePlaybackHandoff } = createOptions();
      getSeekablePlaybackHandoff.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveHandoff = resolve;
        }),
      );

      renderHook(() => useSeekableCacheHandoff(options));
      await waitFor(() =>
        expect(getSeekablePlaybackHandoff).toHaveBeenCalled(),
      );

      await act(async () => {
        invalidate();
        resolveHandoff({
          gatewayJobId: GATEWAY_JOB_ID,
          status: "ready",
          uri: "seekable-runtime-source",
        });
        await Promise.resolve();
      });

      expect(mockedReplaceWithSeekableSource).not.toHaveBeenCalled();
      expect(options.setSeekableCacheStatus).not.toHaveBeenCalled();
      expect(options.recordDiagnostic).not.toHaveBeenCalled();
    },
  );

  it("rejects a result for another gateway job", async () => {
    const { options, getSeekablePlaybackHandoff } = createOptions();
    getSeekablePlaybackHandoff.mockResolvedValueOnce({
      gatewayJobId: "gateway-job-2",
      status: "ready",
      uri: "seekable-runtime-source",
    });

    renderHook(() => useSeekableCacheHandoff(options));
    await waitFor(() => expect(getSeekablePlaybackHandoff).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedReplaceWithSeekableSource).not.toHaveBeenCalled();
    expect(options.setSeekableCacheStatus).not.toHaveBeenCalled();
    expect(options.recordDiagnostic).not.toHaveBeenCalled();
  });

  it("aborts the in-flight observation when the hook unmounts", async () => {
    let observedSignal: AbortSignal | undefined;
    const { options, getSeekablePlaybackHandoff } = createOptions();
    getSeekablePlaybackHandoff.mockImplementationOnce(({ signal }: any) => {
      observedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("cancelled");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const { unmount } = renderHook(() => useSeekableCacheHandoff(options));
    await waitFor(() => expect(observedSignal).toBeDefined());

    unmount();

    expect(observedSignal?.aborted).toBe(true);
    expect(options.controllerRef.current).toBeNull();
    expect(options.recordDiagnostic).not.toHaveBeenCalled();
  });
});
