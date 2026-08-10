import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { Stream } from "@streamer/shared";
import { usePlayerStore } from "../../stores/playerStore";
import { usePlayerController } from "../usePlayerController";

let mockContinueWatchingItems: Array<Record<string, unknown>> = [];
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
    resolveEngine: (stream: unknown) => mockResolveEngine(stream),
  },
}));

jest.mock("../../services/playback/PlaybackSessionPlaybackService", () => ({
  completePlaybackSession: jest.fn(),
  getActivePlaybackSourceRuntime: (sessionId: string, attemptId: string) =>
    mockGetActivePlaybackSourceRuntime(sessionId, attemptId),
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
  useUpdateProgress: () => ({ mutate: jest.fn() }),
  useContinueWatching: () => ({ data: mockContinueWatchingItems }),
}));

jest.mock("../useMeta", () => ({
  useMeta: () => ({ data: null }),
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

function startSession(
  intent: { type: "play" } | { type: "resume"; positionSeconds: number },
) {
  usePlayerStore.getState().setSessionStream(
    { url: "https://cdn.example.test/planned.mp4" } as Stream,
    {
      type: "movie",
      itemId: "tt-launch",
      title: "Launch Movie",
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
    mockActivePlaybackSourceRuntime = null;
    jest.clearAllMocks();
    usePlayerStore.getState().clearPlayer();
    usePlayerStore.setState({
      subscribeToStreamMetrics: mockSubscribeToStreamMetrics,
    });
  });

  it("adopts the session-owned prepared runtime without legacy resolution or cleanup", () => {
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

    const screen = renderHook(() =>
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
    screen.unmount();
    expect(mockPreparedEngine.stop).not.toHaveBeenCalled();
  });

  it("does not resolve a second engine while a session-owned source is pending", () => {
    const player = createMockPlayer();
    startSession({ type: "play" });

    const screen = renderHook(() =>
      usePlayerController({
        player,
        playbackUri: null,
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    expect(screen.result.current.engine).toBeNull();
    expect(mockResolveEngine).not.toHaveBeenCalled();
    screen.unmount();
  });

  it("does not open legacy info-hash metrics for a session-owned source", () => {
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

    const screen = renderHook(() =>
      usePlayerController({
        player,
        playbackUri:
          "http://192.168.1.25:11470/api/bridge/v1/jobs/runtime/stream",
        onClose: jest.fn(),
        showControls: jest.fn(),
      }),
    );

    expect(mockSubscribeToStreamMetrics).not.toHaveBeenCalled();
    screen.unmount();
  });

  afterEach(() => {
    usePlayerStore.getState().clearPlayer();
    usePlayerStore.setState({
      subscribeToStreamMetrics: originalSubscribeToStreamMetrics,
    });
  });

  it("waits for the resolved source ready event before consuming Resume", async () => {
    const player = createMockPlayer();
    startSession({ type: "resume", positionSeconds: 93 });
    const screen = renderHook(
      ({ playbackUri }: { playbackUri: string | null }) =>
        usePlayerController({
          player,
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

    screen.rerender({
      playbackUri: "https://cdn.example.test/resolved.mp4",
    });
    expect(usePlayerStore.getState().playbackLaunchIntent).not.toBeNull();
    expect(player.currentTime).toBe(0);

    act(() => {
      // Expo Video web emits the payload before player.status is updated.
      player.emit("statusChange", { status: "readyToPlay" });
    });

    await waitFor(() => {
      expect(player.currentTime).toBe(93);
      expect(player.play).toHaveBeenCalledTimes(1);
      expect(usePlayerStore.getState().playbackLaunchIntent).toBeNull();
    });
    expect(screen.result.current.showResumePrompt).toBe(false);
    screen.unmount();
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

    const screen = renderHook(() =>
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
    screen.unmount();
  });

  it("reports the native playback completion event", () => {
    const player = createMockPlayer();
    const onCompleted = jest.fn();
    startSession({ type: "play" });
    const screen = renderHook(() =>
      usePlayerController({
        player,
        playbackUri: "https://cdn.example.test/resolved.mp4",
        onClose: jest.fn(),
        showControls: jest.fn(),
        onCompleted,
      }),
    );

    act(() => player.emit("playToEnd", {}));

    expect(onCompleted).toHaveBeenCalledTimes(1);
    screen.unmount();
  });
});
