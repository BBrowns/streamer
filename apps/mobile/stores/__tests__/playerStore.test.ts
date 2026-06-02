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
import { usePlayerStore } from "../playerStore";

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
});
