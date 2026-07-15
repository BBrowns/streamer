import type { Stream } from "@streamer/shared";

const mockEventSourceInstances: Array<{
  addEventListener: jest.Mock;
  removeAllEventListeners: jest.Mock;
  close: jest.Mock;
}> = [];

jest.mock("react-native-sse", () =>
  jest.fn().mockImplementation(() => {
    const instance = {
      addEventListener: jest.fn(),
      removeAllEventListeners: jest.fn(),
      close: jest.fn(),
    };
    mockEventSourceInstances.push(instance);
    return instance;
  }),
);

import EventSource from "react-native-sse";
import { useAuthStore } from "../authStore";
import {
  migratePlayerPreferences,
  normalizePreferredQualities,
  usePlayerStore,
} from "../playerStore";

describe("playerStore", () => {
  beforeEach(() => {
    mockEventSourceInstances.length = 0;
    jest.clearAllMocks();
    useAuthStore.setState({
      streamServerUrl: null,
      streamServerToken: null,
    });
    usePlayerStore.getState().clearPlayer();
  });

  afterEach(() => {
    usePlayerStore.getState().clearPlayer();
  });

  it("migrates the legacy maximum-quality preference to an equivalent allowlist", () => {
    expect(
      migratePlayerPreferences({
        playbackRate: 1,
        preferredQuality: "720p",
        autoPlayNext: true,
      }),
    ).toEqual({
      playbackRate: 1,
      preferredQualities: ["720p", "480p"],
      autoPlayNext: true,
    });
  });

  it("normalizes persisted quality values in display and planner order", () => {
    expect(
      normalizePreferredQualities(["480p", "invalid", "2160p", "480p"]),
    ).toEqual(["2160p", "480p"]);
    expect(normalizePreferredQualities([], "auto")).toEqual([
      "2160p",
      "1080p",
      "720p",
      "480p",
    ]);
  });

  it("clears previous metrics subscriptions when a new stream starts", () => {
    const previousEventSource = {
      addEventListener: jest.fn(),
      removeAllEventListeners: jest.fn(),
      close: jest.fn(),
    };
    const previousTimeout = setTimeout(() => {}, 10_000);

    usePlayerStore.setState({
      _eventSource: previousEventSource as any,
      _peerTimeout: previousTimeout,
      isPlaying: true,
      streamState: "playing",
    });

    usePlayerStore
      .getState()
      .setStream({ url: "https://cdn.example.com/movie.mp4" } as Stream, {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
      });

    const state = usePlayerStore.getState();
    expect(previousEventSource.removeAllEventListeners).toHaveBeenCalled();
    expect(previousEventSource.close).toHaveBeenCalled();
    expect(state.isPlaying).toBe(false);
    expect(state.isBuffering).toBe(true);
    expect(state.runtimeState).toBe("buffering");
    expect(state.runtimeError).toBeNull();
    expect(state.streamMetrics).toBeNull();
    expect(state._eventSource).toBeNull();
    expect(state._peerTimeout).toBeNull();
  });

  it("does not let metrics subscription overwrite an existing player error", () => {
    usePlayerStore.setState({
      currentStream: { url: "", infoHash: "ABCDEF123456" } as Stream,
      streamState: "error",
      errorMessage: "Unsupported codec",
      isBuffering: false,
      _eventSource: null,
      _peerTimeout: null,
    });

    usePlayerStore.getState().subscribeToStreamMetrics("abcdef123456");

    const state = usePlayerStore.getState();
    expect(mockEventSourceInstances).toHaveLength(1);
    expect(
      mockEventSourceInstances[0].removeAllEventListeners,
    ).toHaveBeenCalled();
    expect(mockEventSourceInstances[0].close).toHaveBeenCalled();
    expect(state.streamState).toBe("error");
    expect(state.errorMessage).toBe("Unsupported codec");
    expect(state.isBuffering).toBe(false);
    expect(state._eventSource).toBeNull();
    expect(state._peerTimeout).toBeNull();
  });

  it("sends the optional bridge auth token on metrics subscriptions", () => {
    useAuthStore.setState({
      streamServerUrl: "http://bridge.test",
      streamServerToken: "pairing-token",
    });
    usePlayerStore.setState({
      currentStream: { infoHash: "abcdef123456" } as Stream,
      streamState: "idle",
      errorMessage: null,
    });

    usePlayerStore.getState().subscribeToStreamMetrics("abcdef123456");

    expect(EventSource).toHaveBeenCalledWith(
      "http://bridge.test/api/torrent/abcdef123456/metrics",
      {
        headers: {
          Authorization: "Bearer pairing-token",
        },
      },
    );
  });

  it("stores planned fallback streams when a Play Best stream starts", () => {
    const primary = { url: "https://cdn.example.test/primary.mp4" } as Stream;
    const fallback = { url: "https://cdn.example.test/fallback.mp4" } as Stream;

    usePlayerStore.getState().setStream(primary, undefined, [fallback]);

    const state = usePlayerStore.getState();
    expect(state.currentStream).toBe(primary);
    expect(state.fallbackStreams).toEqual([fallback]);
    expect(state.runtimeState).toBe("buffering");
    expect(state.runtimeError).toBeNull();
  });

  it("stores session context without a raw fallback queue", () => {
    const primary = { url: "https://cdn.example.test/primary.mp4" } as Stream;

    usePlayerStore.getState().setSessionStream(
      primary,
      {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
      },
      "session-1",
      "candidate-1",
      "attempt-1",
    );

    const state = usePlayerStore.getState();
    expect(state.currentStream).toBe(primary);
    expect(state.fallbackStreams).toEqual([]);
    expect(state.playbackSessionId).toBe("session-1");
    expect(state.playbackCandidateId).toBe("candidate-1");
    expect(state.playbackAttemptId).toBe("attempt-1");
    expect(state.runtimeState).toBe("selecting_source");
  });

  it("keeps a resume launch intent runtime-only and consumes it once", () => {
    usePlayerStore.getState().setSessionStream(
      { url: "https://cdn.example.test/primary.mp4" } as Stream,
      {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
      },
      "session-1",
      "candidate-1",
      null,
      null,
      { type: "resume", positionSeconds: 93 },
    );

    expect(usePlayerStore.getState().playbackLaunchIntent).toEqual({
      type: "resume",
      positionSeconds: 93,
    });
    expect(usePlayerStore.getState().consumePlaybackLaunchIntent()).toEqual({
      type: "resume",
      positionSeconds: 93,
    });
    expect(usePlayerStore.getState().playbackLaunchIntent).toBeNull();
  });

  it("preserves a launch intent while the same session resolves or falls back", () => {
    const mediaInfo = {
      type: "movie" as const,
      itemId: "tt-resume",
      title: "Resume Movie",
    };
    const store = usePlayerStore.getState();

    store.setSessionStream(
      { url: "https://cdn.example.test/planned.mp4" } as Stream,
      mediaInfo,
      "session-resume",
      "candidate-planned",
      null,
      null,
      { type: "resume", positionSeconds: 125 },
    );
    store.setSessionStream(
      { url: "https://cdn.example.test/resolved.mp4" } as Stream,
      mediaInfo,
      "session-resume",
      "candidate-resolved",
      "attempt-resolved",
    );

    expect(usePlayerStore.getState().playbackLaunchIntent).toEqual({
      type: "resume",
      positionSeconds: 125,
    });

    store.setSessionStream(
      { url: "https://cdn.example.test/fallback.mp4" } as Stream,
      mediaInfo,
      "session-resume",
      "candidate-fallback",
      "attempt-fallback",
      "Trying another source.",
    );

    expect(usePlayerStore.getState().playbackLaunchIntent).toEqual({
      type: "resume",
      positionSeconds: 125,
    });
  });

  it("does not leak an old launch intent into a different session", () => {
    const store = usePlayerStore.getState();
    store.setSessionStream(
      { url: "https://cdn.example.test/resume.mp4" } as Stream,
      {
        type: "movie",
        itemId: "tt-resume",
        title: "Resume Movie",
      },
      "session-resume",
      "candidate-resume",
      null,
      null,
      { type: "resume", positionSeconds: 125 },
    );
    store.setSessionStream(
      { url: "https://cdn.example.test/new.mp4" } as Stream,
      {
        type: "movie",
        itemId: "tt-new",
        title: "New Movie",
      },
      "session-new",
      "candidate-new",
    );

    expect(usePlayerStore.getState().playbackLaunchIntent).toBeNull();
  });

  it("does not let legacy fallback bypass an active playback session", () => {
    const primary = { url: "https://cdn.example.test/primary.mp4" } as Stream;
    const fallback = { url: "https://cdn.example.test/fallback.mp4" } as Stream;

    usePlayerStore.setState({
      currentStream: primary,
      fallbackStreams: [fallback],
      playbackSessionId: "session-1",
      playbackCandidateId: "candidate-1",
      playbackAttemptId: "attempt-1",
    });

    expect(
      usePlayerStore.getState().advanceToNextFallback("Timed out."),
    ).toBeNull();
    expect(usePlayerStore.getState().currentStream).toBe(primary);
  });

  it("starts torrent streams in a finding-peers runtime state", () => {
    usePlayerStore
      .getState()
      .setStream({ infoHash: "abcdef123456" } as Stream, undefined, []);

    const state = usePlayerStore.getState();
    expect(state.streamState).toBe("loading_metrics");
    expect(state.runtimeState).toBe("finding_peers");
    expect(state.runtimeError).toBeNull();
  });

  it("advances to the next fallback stream and clears transient metrics", () => {
    const previousEventSource = {
      addEventListener: jest.fn(),
      removeAllEventListeners: jest.fn(),
      close: jest.fn(),
    };
    const previousTimeout = setTimeout(() => {}, 10_000);
    const primary = { url: "https://cdn.example.test/primary.mp4" } as Stream;
    const fallback = { url: "https://cdn.example.test/fallback.mp4" } as Stream;

    usePlayerStore.setState({
      currentStream: primary,
      fallbackStreams: [fallback],
      isPlaying: true,
      isBuffering: false,
      streamState: "playing",
      streamMetrics: {
        state: "ready",
        numPeers: 3,
        downloadSpeed: 1024,
        progress: 0.5,
        downloaded: 1024,
      },
      _eventSource: previousEventSource as any,
      _peerTimeout: previousTimeout,
    });

    const next = usePlayerStore
      .getState()
      .advanceToNextFallback("Playback timed out.");

    const state = usePlayerStore.getState();
    expect(next).toBe(fallback);
    expect(previousEventSource.removeAllEventListeners).toHaveBeenCalled();
    expect(previousEventSource.close).toHaveBeenCalled();
    expect(state.currentStream).toBe(fallback);
    expect(state.fallbackStreams).toEqual([]);
    expect(state.fallbackReason).toBe("Playback timed out.");
    expect(state.isPlaying).toBe(false);
    expect(state.isBuffering).toBe(true);
    expect(state.streamState).toBe("loading_metrics");
    expect(state.runtimeState).toBe("trying_fallback");
    expect(state.runtimeError).toBeNull();
    expect(state.streamMetrics).toBeNull();
  });

  it("infers typed runtime failures from legacy stream status errors", () => {
    usePlayerStore
      .getState()
      .setStreamStatus("error", "Unsupported codec h265");

    const state = usePlayerStore.getState();
    expect(state.runtimeState).toBe("failed_unsupported_codec");
    expect(state.runtimeError).toMatchObject({
      code: "UNSUPPORTED_CODEC",
      message: "Unsupported codec h265",
    });
    expect(state.isBuffering).toBe(false);
  });

  it("stores explicit typed runtime failures", () => {
    usePlayerStore.getState().setRuntimeFailure({
      code: "NO_PEERS",
      message: "No peers found after 45 seconds.",
      retryable: true,
      shouldFallback: false,
    });

    const state = usePlayerStore.getState();
    expect(state.streamState).toBe("error");
    expect(state.runtimeState).toBe("failed_no_peers");
    expect(state.runtimeError?.code).toBe("NO_PEERS");
    expect(state.errorMessage).toBe("No peers found after 45 seconds.");
    expect(state.isBuffering).toBe(false);
  });

  it("keeps torrent metrics in buffering until the video player reports playback", () => {
    usePlayerStore
      .getState()
      .setSessionStream(
        { infoHash: "abcdef123456" } as Stream,
        undefined,
        "session-1",
        "candidate-1",
        "attempt-1",
      );
    usePlayerStore.getState().subscribeToStreamMetrics("abcdef123456");
    const messageHandler =
      mockEventSourceInstances[0].addEventListener.mock.calls.find(
        ([event]) => event === "message",
      )?.[1];

    messageHandler?.({
      data: JSON.stringify({
        state: "ready",
        numPeers: 3,
        downloadSpeed: 1024,
        progress: 0.5,
        downloaded: 1024,
      }),
    });

    const state = usePlayerStore.getState();
    expect(state.streamState).toBe("loading_metrics");
    expect(state.runtimeState).toBe("buffering");
    expect(state.isBuffering).toBe(true);
  });
});
