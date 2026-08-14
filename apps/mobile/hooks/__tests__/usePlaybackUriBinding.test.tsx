import { renderHook, waitFor } from "@testing-library/react-native";

import {
  usePlaybackUriBinding,
  type PlaybackUriMessage,
} from "../usePlaybackUriBinding";
import { streamEngineManager } from "../../services/streamEngine/StreamEngineManager";
import { getUnsupportedWebCodecReason } from "../../services/streamEngine/codecSupport";
import { resolvePlaybackSession } from "../../services/playback/PlaybackSessionPlaybackService";

jest.mock("../../services/streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    getPlaybackUri: jest.fn(),
  },
}));

jest.mock("../../services/streamEngine/codecSupport", () => ({
  getUnsupportedWebCodecReason: jest.fn(() => null),
}));

jest.mock("../../services/playback/PlaybackSessionPlaybackService", () => ({
  resolvePlaybackSession: jest.fn(),
}));

const mockedGetPlaybackUri = jest.mocked(streamEngineManager.getPlaybackUri);
const mockedGetUnsupportedWebCodecReason = jest.mocked(
  getUnsupportedWebCodecReason,
);
const mockedResolvePlaybackSession = jest.mocked(resolvePlaybackSession);

const mediaInfo = {
  type: "movie" as const,
  itemId: "movie-1",
  title: "Example movie",
};

function createOptions(overrides: Record<string, unknown> = {}) {
  return {
    currentStream: { url: undefined, title: "Example" },
    mediaInfo,
    playbackSessionId: null,
    playbackCandidateId: null,
    playbackAttemptId: null,
    resolveAttempt: 0,
    setPlaybackUri: jest.fn(),
    setStreamStatus: jest.fn(),
    setSessionStream: jest.fn(),
    setRuntimeFailure: jest.fn(),
    getErrorMessage: jest.fn(
      (message: PlaybackUriMessage) => `message:${message}`,
    ),
    tryReplanPartialPlayback: jest.fn(() => Promise.resolve(false)),
    tryAdvanceToFallback: jest.fn(() => Promise.resolve(false)),
    ...overrides,
  };
}

describe("usePlaybackUriBinding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetPlaybackUri.mockResolvedValue("opaque://source");
    mockedGetUnsupportedWebCodecReason.mockReturnValue(null);
    mockedResolvePlaybackSession.mockResolvedValue({
      ok: false,
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "unavailable",
        retryable: true,
        shouldFallback: false,
      },
    } as any);
  });

  it("resolves a legacy stream through the engine adapter", async () => {
    const options = createOptions();
    await renderHook(() => usePlaybackUriBinding(options));

    await waitFor(() =>
      expect(options.setPlaybackUri).toHaveBeenCalledWith("opaque://source"),
    );
    expect(options.setStreamStatus).toHaveBeenCalledWith("loading_metrics");
  });

  it("publishes a session resolver URI and refreshed stream", async () => {
    mockedResolvePlaybackSession.mockResolvedValue({
      ok: true,
      stream: { url: "resolved-source" },
      uri: "resolved-source",
      sessionId: "session-2",
      candidateId: "candidate-2",
      attemptId: "attempt-2",
      fallbackReason: null,
    } as any);
    const options = createOptions({
      currentStream: { title: "Example" },
      playbackSessionId: "session-1",
      playbackCandidateId: "candidate-1",
      playbackAttemptId: "attempt-1",
    });
    await renderHook(() => usePlaybackUriBinding(options));

    await waitFor(() =>
      expect(options.setPlaybackUri).toHaveBeenCalledWith("resolved-source"),
    );
    expect(options.setSessionStream).toHaveBeenCalledWith(
      { url: "resolved-source" },
      mediaInfo,
      "session-2",
      "candidate-2",
      "attempt-2",
      null,
    );
  });

  it("delegates an unavailable legacy URI to fallback coordination", async () => {
    mockedGetPlaybackUri.mockResolvedValue(null);
    const options = createOptions();
    const tryAdvanceToFallback = jest.fn(() => Promise.resolve(true));
    options.tryAdvanceToFallback = tryAdvanceToFallback;
    await renderHook(() => usePlaybackUriBinding(options));

    await waitFor(() => expect(tryAdvanceToFallback).toHaveBeenCalled());
    expect(tryAdvanceToFallback).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SOURCE_UNAVAILABLE" }),
      "message:noStream",
    );
    expect(options.setRuntimeFailure).not.toHaveBeenCalled();
  });

  it("reports an unsupported codec when fallback cannot advance", async () => {
    mockedGetUnsupportedWebCodecReason.mockImplementation(
      () => "unsupported" as any,
    );
    const options = createOptions();
    await renderHook(() => usePlaybackUriBinding(options));

    await waitFor(() =>
      expect(options.setRuntimeFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "UNSUPPORTED_CODEC",
          message: "message:unsupportedCodec",
        }),
      ),
    );
    expect(mockedGetPlaybackUri).not.toHaveBeenCalled();
  });
});
