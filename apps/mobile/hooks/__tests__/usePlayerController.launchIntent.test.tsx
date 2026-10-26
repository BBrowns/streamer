import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { Stream } from "@streamer/shared";
import { usePlayerStore } from "../../stores/playerStore";
import { usePlayerController } from "../usePlayerController";

let mockContinueWatchingItems: Array<Record<string, unknown>> = [];
const mockUpdateProgress = jest.fn();
const mockBeginPlaybackLaunch = jest.fn(() => "planning-launch");
let mockMeta: Record<string, unknown> | null = null;
const originalSubscribeToStreamMetrics =
  usePlayerStore.getState().subscribeToStreamMetrics;
const mockSubscribeToStreamMetrics = jest.fn();

const mockEngine = {
  getAudioTracks: jest.fn(() => []),
  getSubtitles: jest.fn(() => []),
  on: jest.fn(),
  off: jest.fn(),
  stop: jest.fn(),
};
const mockPreparedEngine = {
  getAudioTracks: jest.fn(() => []),
  getSubtitles: jest.fn(() => []),
  on: jest.fn(),
  off: jest.fn(),
  stop: jest.fn(),
};
const mockResolveEngine = jest.fn((_stream?: unknown) => mockEngine);
let mockActivePlaybackSourceRuntime: {
  route?: Record<string, unknown>;
  bridgeJobId?: string;
  runtime?: typeof mockPreparedEngine;
} | null = null;
const mockGetActivePlaybackSourceRuntime = jest.fn(
  (_sessionId?: string, _attemptId?: string) => mockActivePlaybackSourceRuntime,
);

jest.mock("../../services/streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    getBridgeSnapshot: jest.fn(() => ({
      available: false,
      status: "unreachable",
      diagnostics: { status: "unreachable" },
      url: null,
    })),
    subscribeBridge: jest.fn(() => jest.fn()),
    resolveEngine: (stream: unknown) => mockResolveEngine(stream),
  },
}));

jest.mock("../../services/playback/PlaybackSessionPlaybackService", () => ({
  completePlaybackSession: jest.fn(),
  getActivePlaybackSourceRuntime: (sessionId: string, attemptId: string) =>
    mockGetActivePlaybackSourceRuntime(sessionId, attemptId),
}));

jest.mock("../../services/playback/PlaybackLaunchService", () => ({
  beginPlaybackLaunch: (...args: unknown[]) => mockBeginPlaybackLaunch(...args),
}));

jest.mock("../useSync", () => ({
  useSync: () => ({ sendMessage: jest.fn() }),
}));

jest.mock("../useRemoteControl", () => ({
  useRemoteControl: () => ({ updateStatus: jest.fn() }),
}));

jest.mock("../useTraktScrobbler", () => ({
  useTraktScrobbler: jest.fn(),
}));

jest.mock("../useContinueWatching", () => ({
  useUpdateProgress: () => ({ mutate: mockUpdateProgress }),
  useContinueWatching: () => ({ data: mockContinueWatchingItems }),
}));

jest.mock("../useMeta", () => ({
  useMeta: () => ({ data: mockMeta }),
}));

jest.mock("../../services/api", () => ({
  api: { get: jest.fn() },
}));

function createMockPlayer() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  const player = {
    status: "loading",
    duration: 0,
    currentTime: 0,
    bufferedPosition: 0,
    playing: false,
    play: jest.fn(() => {
      player.playing = true;
    }),
    pause: jest.fn(() => {
      player.playing = false;
    }),
    addListener: jest.fn((event: string, callback: (value: any) => void) => {
      const callbacks = listeners.get(event) ?? new Set();
      callbacks.add(callback);
      listeners.set(event, callbacks);
      return {
        remove: () => callbacks.delete(callback),
      };
    }),
    emit(event: string, value: any) {
      listeners.get(event)?.forEach((callback) => callback(value));
    },
  };
  return player;
}

function deferredSeek() {
  let resolve!: (position: number) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<number>((resolveSeek, rejectSeek) => {
    resolve = resolveSeek;
    reject = rejectSeek;
  });
  return { promise, resolve, reject };
}

function startSession(
  intent: { type: "play" } | { type: "resume"; positionSeconds: number },
  mediaOverrides: { background?: string } = {},
) {
  usePlayerStore.getState().setSessionStream(
    { url: "https://cdn.example.test/planned.mp4" } as Stream,
    {
      type: "movie",
      itemId: "tt-launch",
      title: "Launch Movie",
      background: "https://images.example.test/launch-backdrop.jpg",
      ...mediaOverrides,
    },
    "session-launch",
    "candidate-launch",
    "attempt-launch",
    null,
    intent,
  );
}

describe("usePlayerController playback launch intent", () => {
  beforeEach(() => {
    mockContinueWatchingItems = [];
    mockMeta = null;
    mockActivePlaybackSourceRuntime = null;
    jest.clearAllMocks();
    usePlayerStore.getState().clearPlayer();
    usePlayerStore.setState({
      subscribeToStreamMetrics: mockSubscribeToStreamMetrics,
    });
  });

  it("adopts the session-owned prepared runtime without legacy resolution or cleanup", async () => {
    const player = createMockPlayer();
    mockActivePlaybackSourceRuntime = {
      route: {
        candidateId: "candidate-launch",
        executionTarget: "on-device",
        delivery: "direct",
        capabilities: {},
      },
      bridgeJobId: "bridge-job",
      runtime: mockPreparedEngine,
    };
    startSession({ type: "play" });

    const screen = await renderHook(() =>
      usePlayerController({
        player,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    expect(screen.result.current.engine).toBe(mockPreparedEngine);
    expect(screen.result.current.playbackRoute).toMatchObject({
      delivery: "direct",
    });
    expect(screen.result.current.bridgeJobId).toBe("bridge-job");
    expect(mockGetActivePlaybackSourceRuntime).toHaveBeenCalledWith(
      "session-launch",
      "attempt-launch",
    );
    expect(mockResolveEngine).not.toHaveBeenCalled();
    await screen.unmount();
    expect(mockPreparedEngine.stop).not.toHaveBeenCalled();
  });

  it("does not resolve a second engine while a session-owned source is pending", async () => {
    const player = createMockPlayer();
    startSession({ type: "play" });

    const screen = await renderHook(() =>
      usePlayerController({
        player,
        playbackUri: null,
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    expect(screen.result.current.engine).toBeNull();
    expect(mockResolveEngine).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("does not open legacy info-hash metrics for a session-owned source", async () => {
    const player = createMockPlayer();
    usePlayerStore.getState().setSessionStream(
      {
        infoHash: "0123456789abcdef0123456789abcdef01234567",
        url: "http://192.168.1.25:11470/api/bridge/v1/jobs/runtime/stream",
      } as Stream,
      {
        type: "movie",
        itemId: "tt-launch",
        title: "Launch Movie",
      },
      "session-launch",
      "candidate-launch",
      "attempt-launch",
    );

    const screen = await renderHook(() =>
      usePlayerController({
        player,
        playbackUri:
          "http://192.168.1.25:11470/api/bridge/v1/jobs/runtime/stream",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    expect(mockSubscribeToStreamMetrics).not.toHaveBeenCalled();
    await screen.unmount();
  });

  afterEach(() => {
    usePlayerStore.getState().clearPlayer();
    usePlayerStore.setState({
      subscribeToStreamMetrics: originalSubscribeToStreamMetrics,
    });
  });

  it("waits for the resolved source ready event before consuming Resume", async () => {
    const player = createMockPlayer();
    const commitSeek = jest.fn(async (position: number) => {
      player.currentTime = position;
      return position;
    });
    startSession({ type: "resume", positionSeconds: 93 });
    const screen = await renderHook(
      ({ playbackUri }: { playbackUri: string | null }) =>
        usePlayerController({
          player,
          commitSeek,
          playbackUri,
          onClose: jest.fn(),
          showControls: jest.fn(),
        }),
      { initialProps: { playbackUri: null } },
    );

    expect(usePlayerStore.getState().playbackLaunchIntent).toEqual({
      type: "resume",
      positionSeconds: 93,
    });
    expect(player.play).not.toHaveBeenCalled();

    await screen.rerender({
      playbackUri: "https://cdn.example.test/resolved.mp4",
    });
    expect(usePlayerStore.getState().playbackLaunchIntent).not.toBeNull();
    expect(player.currentTime).toBe(0);

    await act(() => {
      // Expo Video web emits the payload before player.status is updated.
      player.emit("statusChange", { status: "readyToPlay" });
    });

    await waitFor(() => {
      expect(player.currentTime).toBe(93);
      expect(player.play).toHaveBeenCalledTimes(1);
      expect(usePlayerStore.getState().playbackLaunchIntent).toBeNull();
    });
    expect(screen.result.current.showResumePrompt).toBe(false);
    await screen.unmount();
  });

  it.each([undefined, 41])(
    "restores the explicit Resume position after rejection with saved progress %s",
    async (savedPosition) => {
      if (savedPosition !== undefined) {
        mockContinueWatchingItems = [
          {
            itemId: "tt-launch",
            type: "movie",
            currentTime: savedPosition,
            duration: 300,
          },
        ];
      }
      const player = createMockPlayer();
      player.status = "readyToPlay";
      player.duration = 300;
      const commitSeek = jest
        .fn()
        .mockRejectedValueOnce(new Error("Outside the seekable media range."))
        .mockResolvedValueOnce(92.5);
      startSession({ type: "resume", positionSeconds: 93 });

      const screen = await renderHook(() =>
        usePlayerController({
          player,
          commitSeek,
          playbackUri: "https://cdn.example.test/windowed.m3u8",
          onClose: jest.fn(),
          showControls: jest.fn(),
        }),
      );

      await waitFor(() => {
        expect(screen.result.current.showResumePrompt).toBe(true);
      });
      expect(screen.result.current.resumePromptTimeSeconds).toBe(93);
      expect(usePlayerStore.getState().playbackLaunchIntent).toBeNull();
      expect(player.play).not.toHaveBeenCalled();
      expect(mockUpdateProgress).not.toHaveBeenCalled();

      await act(() => screen.result.current.handleResumeResponse(true));

      await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
      expect(commitSeek).toHaveBeenNthCalledWith(
        2,
        93,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(screen.result.current.showResumePrompt).toBe(false);
      await act(() => screen.result.current.reportProgress(true));
      expect(mockUpdateProgress).toHaveBeenCalledWith(
        expect.objectContaining({ currentTime: 92.5 }),
      );
      await screen.unmount();
    },
  );

  it("confirms Start Over before playing after a failed Resume moved the native clock", async () => {
    mockContinueWatchingItems = [
      {
        itemId: "tt-launch",
        type: "movie",
        currentTime: 93,
        duration: 300,
      },
    ];
    const player = createMockPlayer();
    player.status = "readyToPlay";
    player.duration = 300;
    player.playing = true;
    const restart = deferredSeek();
    const commitSeek = jest
      .fn()
      .mockImplementationOnce(async (position: number) => {
        player.currentTime = position;
        throw new Error("Timed out confirming the seek target.");
      })
      .mockImplementationOnce((position: number) => {
        player.currentTime = position;
        return restart.promise;
      });
    startSession({ type: "play" });
    usePlayerStore.getState().consumePlaybackLaunchIntent();
    const screen = await renderHook(() =>
      usePlayerController({
        player,
        commitSeek,
        playbackUri: "https://cdn.example.test/windowed.m3u8",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    expect(screen.result.current.showResumePrompt).toBe(true);
    expect(player.pause).toHaveBeenCalledTimes(1);
    await act(() => screen.result.current.handleResumeResponse(true));

    await waitFor(() => {
      expect(screen.result.current.showResumePrompt).toBe(true);
    });
    expect(screen.result.current.resumePromptTimeSeconds).toBe(93);
    expect(player.currentTime).toBe(93);
    expect(player.play).not.toHaveBeenCalled();
    expect(mockUpdateProgress).not.toHaveBeenCalled();

    await act(() => screen.result.current.handleResumeResponse(false));

    expect(screen.result.current.showResumePrompt).toBe(false);
    expect(commitSeek).toHaveBeenNthCalledWith(
      2,
      0,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(player.play).not.toHaveBeenCalled();
    await act(() => screen.result.current.reportProgress(true));
    expect(mockUpdateProgress).not.toHaveBeenCalled();

    await act(() => {
      player.currentTime = 0.25;
      restart.resolve(0.25);
    });

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.currentTime).toBe(0.25);
    await act(() => screen.result.current.reportProgress(true));
    expect(mockUpdateProgress).toHaveBeenCalledWith(
      expect.objectContaining({ currentTime: 0.25 }),
    );
    expect(commitSeek).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("preserves the original Resume choice when Start Over cannot confirm zero", async () => {
    const player = createMockPlayer();
    player.status = "readyToPlay";
    player.duration = 300;
    const commitSeek = jest
      .fn()
      .mockImplementationOnce(async (position: number) => {
        player.currentTime = position;
        throw new Error("Timed out confirming Resume.");
      })
      .mockRejectedValueOnce(new Error("Timed out confirming zero."))
      .mockResolvedValueOnce(92.75);
    startSession({ type: "resume", positionSeconds: 93 });
    const screen = await renderHook(() =>
      usePlayerController({
        player,
        commitSeek,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );
    expect(screen.result.current.showResumePrompt).toBe(true);

    await act(() => screen.result.current.handleResumeResponse(false));

    await waitFor(() => {
      expect(screen.result.current.showResumePrompt).toBe(true);
    });
    expect(screen.result.current.resumePromptTimeSeconds).toBe(93);
    expect(player.play).not.toHaveBeenCalled();
    expect(mockUpdateProgress).not.toHaveBeenCalled();
    expect(commitSeek).toHaveBeenNthCalledWith(
      2,
      0,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await act(() => screen.result.current.handleResumeResponse(true));

    expect(commitSeek).toHaveBeenNthCalledWith(
      3,
      93,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(player.play).toHaveBeenCalledTimes(1);
    await act(() => screen.result.current.reportProgress(true));
    expect(mockUpdateProgress).toHaveBeenCalledWith(
      expect.objectContaining({ currentTime: 92.75 }),
    );
    await screen.unmount();
  });

  it("confirms a normal Start Over at zero before playing", async () => {
    mockContinueWatchingItems = [
      {
        itemId: "tt-launch",
        type: "movie",
        currentTime: 93,
        duration: 300,
      },
    ];
    const player = createMockPlayer();
    player.status = "readyToPlay";
    const commitSeek = jest.fn().mockResolvedValue(0);
    startSession({ type: "play" });
    usePlayerStore.getState().consumePlaybackLaunchIntent();
    const screen = await renderHook(() =>
      usePlayerController({
        player,
        commitSeek,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    await act(() => screen.result.current.handleResumeResponse(false));

    expect(commitSeek).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(commitSeek).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(screen.result.current.showResumePrompt).toBe(false);
    await screen.unmount();
  });

  it.each([
    ["AbortError", "reject"],
    ["SeekSupersededError", "reject"],
    ["source URI", "resolve"],
    ["source URI", "reject"],
    ["source replacement", "resolve"],
    ["source replacement", "reject"],
    ["attempt", "resolve"],
    ["attempt", "reject"],
    ["session", "resolve"],
    ["session", "reject"],
    ["unmount", "resolve"],
    ["unmount", "reject"],
  ] as const)(
    "keeps Start Over inert after %s despite late %s",
    async (invalidation, outcome) => {
      mockContinueWatchingItems = [
        {
          itemId: "tt-launch",
          type: "movie",
          currentTime: 93,
          duration: 300,
        },
      ];
      const player = createMockPlayer();
      player.status = "readyToPlay";
      const seek = deferredSeek();
      const commitSeek = jest.fn(
        (_position: number, _options?: { signal?: AbortSignal }) =>
          seek.promise,
      );
      startSession({ type: "play" });
      usePlayerStore.getState().consumePlaybackLaunchIntent();
      const screen = await renderHook(
        ({ playbackUri }: { playbackUri: string }) =>
          usePlayerController({
            player,
            commitSeek,
            playbackUri,
            onClose: jest.fn(),
            showControls: jest.fn(),
          }),
        {
          initialProps: {
            playbackUri: "https://cdn.example.test/resolved.mp4",
          },
        },
      );
      await act(() => screen.result.current.handleResumeResponse(false));
      expect(commitSeek).toHaveBeenCalledWith(
        0,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );

      if (invalidation === "source URI") {
        await screen.rerender({
          playbackUri: "https://cdn.example.test/replacement.mp4",
        });
      } else if (invalidation === "source replacement") {
        await act(() => screen.result.current.beginProgressSourceReplacement());
      } else if (invalidation === "attempt") {
        await act(() => {
          usePlayerStore.setState({ playbackAttemptId: "attempt-next" });
        });
      } else if (invalidation === "session") {
        await act(() => {
          usePlayerStore.setState({ playbackSessionId: "session-next" });
        });
      } else if (invalidation === "unmount") {
        await screen.unmount();
      }
      if (
        invalidation !== "AbortError" &&
        invalidation !== "SeekSupersededError"
      ) {
        expect(commitSeek.mock.calls[0][1]?.signal?.aborted).toBe(true);
      }

      await act(() => {
        if (outcome === "resolve") seek.resolve(0.25);
        else {
          const error = new Error("The old zero seek did not complete.");
          error.name = invalidation;
          seek.reject(error);
        }
      });

      expect(player.play).not.toHaveBeenCalled();
      expect(mockUpdateProgress).not.toHaveBeenCalled();
      if (invalidation !== "unmount") {
        expect(screen.result.current.showResumePrompt).toBe(false);
        await act(() => screen.result.current.reportProgress(true));
        expect(mockUpdateProgress).not.toHaveBeenCalled();
        await screen.unmount();
      }
    },
  );

  it.each(["AbortError", "SeekSupersededError"])(
    "keeps a Resume %s inert",
    async (name) => {
      const player = createMockPlayer();
      player.status = "readyToPlay";
      const error = new Error("The seek is no longer active.");
      error.name = name;
      const commitSeek = jest.fn().mockRejectedValue(error);
      startSession({ type: "resume", positionSeconds: 93 });
      const screen = await renderHook(() =>
        usePlayerController({
          player,
          commitSeek,
          playbackUri: "https://cdn.example.test/windowed.m3u8",
          onClose: jest.fn(),
          showControls: jest.fn(),
        }),
      );

      expect(commitSeek).toHaveBeenCalledTimes(1);
      expect(screen.result.current.showResumePrompt).toBe(false);
      expect(player.play).not.toHaveBeenCalled();
      expect(mockUpdateProgress).not.toHaveBeenCalled();
      await screen.unmount();
    },
  );

  it.each([
    ["source URI", "resolve"],
    ["source URI", "reject"],
    ["source replacement", "resolve"],
    ["source replacement", "reject"],
    ["attempt", "resolve"],
    ["attempt", "reject"],
    ["unmount", "resolve"],
    ["unmount", "reject"],
  ] as const)(
    "keeps Resume inert after %s despite late %s",
    async (invalidation, outcome) => {
      const player = createMockPlayer();
      player.status = "readyToPlay";
      const seek = deferredSeek();
      const commitSeek = jest.fn(
        (_position: number, _options?: { signal?: AbortSignal }) =>
          seek.promise,
      );
      startSession({ type: "resume", positionSeconds: 93 });
      const screen = await renderHook(
        ({ playbackUri }: { playbackUri: string }) =>
          usePlayerController({
            player,
            commitSeek,
            playbackUri,
            onClose: jest.fn(),
            showControls: jest.fn(),
          }),
        {
          initialProps: {
            playbackUri: "https://cdn.example.test/windowed.m3u8",
          },
        },
      );
      expect(commitSeek).toHaveBeenCalledTimes(1);

      if (invalidation === "source URI") {
        await screen.rerender({
          playbackUri: "https://cdn.example.test/replacement.m3u8",
        });
      } else if (invalidation === "source replacement") {
        await act(() => screen.result.current.beginProgressSourceReplacement());
      } else if (invalidation === "attempt") {
        await act(() => {
          usePlayerStore.setState({ playbackAttemptId: "attempt-next" });
        });
      } else {
        await screen.unmount();
      }
      expect(commitSeek.mock.calls[0][1]?.signal?.aborted).toBe(true);

      await act(() => {
        if (outcome === "resolve") seek.resolve(93);
        else seek.reject(new Error("The old seek did not complete."));
      });

      expect(player.play).not.toHaveBeenCalled();
      expect(mockUpdateProgress).not.toHaveBeenCalled();
      if (invalidation !== "unmount") {
        expect(screen.result.current.showResumePrompt).toBe(false);
        await act(() => screen.result.current.reportProgress(true));
        expect(mockUpdateProgress).not.toHaveBeenCalled();
        await screen.unmount();
      }
    },
  );

  it("does not consume a next-episode planning intent while the old URI is still mounted", async () => {
    const player = createMockPlayer();
    player.status = "readyToPlay";
    mockMeta = {
      videos: [
        { id: "episode-2", season: 1, episode: 2, title: "Second episode" },
      ],
    };
    usePlayerStore.getState().setPlaybackPlanning(
      {
        type: "series",
        itemId: "series-1",
        title: "Example series - First episode",
        season: 1,
        episode: 1,
      },
      "planning-launch",
    );

    const screen = await renderHook(() =>
      usePlayerController({
        player,
        // This simulates the previous HLS/direct URI surviving for one render
        // while the next episode launch is being installed.
        playbackUri: "https://cdn.example.test/previous.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    await waitFor(() => {
      expect(usePlayerStore.getState().playbackLaunchIntent).toEqual({
        type: "planning",
        launchId: "planning-launch",
      });
    });
    expect(player.play).not.toHaveBeenCalled();
    expect(mockBeginPlaybackLaunch).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("lets explicit Play suppress an existing resume prompt", async () => {
    mockContinueWatchingItems = [
      {
        itemId: "tt-launch",
        type: "movie",
        currentTime: 93,
        duration: 300,
      },
    ];
    const player = createMockPlayer();
    player.status = "readyToPlay";
    player.duration = 300;
    startSession({ type: "play" });

    const screen = await renderHook(() =>
      usePlayerController({
        player,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    await waitFor(() => {
      expect(player.play).toHaveBeenCalledTimes(1);
      expect(usePlayerStore.getState().playbackLaunchIntent).toBeNull();
    });
    expect(player.currentTime).toBe(0);
    expect(player.pause).not.toHaveBeenCalled();
    expect(screen.result.current.showResumePrompt).toBe(false);
    await screen.unmount();
  });

  it("reports the native playback completion event", async () => {
    const player = createMockPlayer();
    const onCompleted = jest.fn();
    startSession({ type: "play" });
    const screen = await renderHook(() =>
      usePlayerController({
        player,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
        onCompleted,
      }),
    );

    await act(() => player.emit("playToEnd", {}));

    expect(onCompleted).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("routes a progressive file end before the seekable handoff to fallback", async () => {
    const player = createMockPlayer();
    player.currentTime = 18;
    player.duration = Number.POSITIVE_INFINITY;
    const onCompleted = jest.fn();
    const onPrematureEnd = jest.fn();
    startSession({ type: "play" });
    const screen = await renderHook(() =>
      usePlayerController({
        player,
        playbackUri: "https://cdn.example.test/progressive.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
        isProgressiveRemux: true,
        hasSeekableHandoff: false,
        onCompleted,
        onPrematureEnd,
      }),
    );

    await act(() => player.emit("playToEnd", {}));

    expect(onPrematureEnd).toHaveBeenCalledTimes(1);
    expect(onCompleted).not.toHaveBeenCalled();
    await screen.unmount();
  });

  it("reports the current landscape background with watch progress", async () => {
    const player = createMockPlayer();
    player.status = "readyToPlay";
    player.duration = 300;
    startSession({ type: "play" });
    const screen = await renderHook(() =>
      usePlayerController({
        player,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    await act(() => {
      player.currentTime = 5;
      player.emit("timeUpdate", { currentTime: 5 });
      player.emit("playingChange", { isPlaying: false });
    });

    expect(mockUpdateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "tt-launch",
        background: "https://images.example.test/launch-backdrop.jpg",
      }),
    );
    await screen.unmount();
  });

  it("keeps watch progress title-relative when the native media clock has an offset", async () => {
    const player = createMockPlayer();
    player.status = "readyToPlay";
    player.duration = 300;
    player.currentTime = 105;
    const readMediaSnapshot = jest.fn(() => ({
      currentTime: 5,
      duration: 300,
    }));
    startSession({ type: "play" });
    const screen = await renderHook(() =>
      usePlayerController({
        player,
        readMediaSnapshot: readMediaSnapshot as any,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    await act(() => {
      player.emit("timeUpdate", { currentTime: 105 });
      player.emit("playingChange", { isPlaying: false });
    });

    expect(mockUpdateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTime: 5,
        duration: 300,
      }),
    );
    expect(readMediaSnapshot).toHaveBeenCalled();
    await screen.unmount();
  });

  it("omits malformed optional artwork instead of rejecting watch progress", async () => {
    const player = createMockPlayer();
    player.status = "readyToPlay";
    player.duration = 300;
    startSession({ type: "play" }, { background: "relative/backdrop.jpg" });
    const screen = await renderHook(() =>
      usePlayerController({
        player,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    await act(() => {
      player.currentTime = 5;
      player.emit("timeUpdate", { currentTime: 5 });
      player.emit("playingChange", { isPlaying: false });
    });

    expect(mockUpdateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "tt-launch",
        background: undefined,
      }),
    );
    await screen.unmount();
  });
});
