import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { Stream } from "@streamer/shared";
import { usePlayerStore } from "../../stores/playerStore";
import { usePlayerController } from "../usePlayerController";

let mockContinueWatchingItems: Array<Record<string, unknown>> = [];

const mockEngine = {
  getAudioTracks: jest.fn(() => []),
  getSubtitles: jest.fn(() => []),
  on: jest.fn(),
  off: jest.fn(),
  stop: jest.fn(),
};

jest.mock("../../services/streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    resolveEngine: () => mockEngine,
  },
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
    null,
    null,
    intent,
  );
}

describe("usePlayerController playback launch intent", () => {
  beforeEach(() => {
    mockContinueWatchingItems = [];
    jest.clearAllMocks();
    usePlayerStore.getState().clearPlayer();
  });

  afterEach(() => {
    usePlayerStore.getState().clearPlayer();
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
});
