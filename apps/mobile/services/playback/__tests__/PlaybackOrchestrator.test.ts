import type { PlaybackPlan } from "@streamer/shared";
import { playBest } from "../PlaybackOrchestrator";
import {
  createPlaybackPlanWithBridgeRetry,
  resolvePlaybackPlan,
} from "../PlaybackPlanService";

jest.mock("../PlaybackPlanService", () => ({
  createPlaybackPlanWithBridgeRetry: jest.fn(),
  resolvePlaybackPlan: jest.fn(),
}));

describe("PlaybackOrchestrator", () => {
  const createPlan = createPlaybackPlanWithBridgeRetry as jest.MockedFunction<
    typeof createPlaybackPlanWithBridgeRetry
  >;
  const resolvePlan = resolvePlaybackPlan as jest.MockedFunction<
    typeof resolvePlaybackPlan
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a prepared stream, media info, and fallback queue for Play Best", async () => {
    const plan: PlaybackPlan = {
      state: "ready",
      plan: {
        mode: "direct",
        selectedCandidate: {
          id: "primary",
          kind: "direct",
          stream: {
            url: "https://cdn.example.test/primary.mp4",
            title: "Primary",
          },
          riskFlags: [],
        },
      },
    };
    const fallback = {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Fallback",
    };

    createPlan.mockResolvedValueOnce(plan);
    resolvePlan.mockResolvedValueOnce({
      resolved: {
        stream: {
          url: "https://cdn.example.test/primary.mp4",
          title: "Primary",
        },
        uri: "https://cdn.example.test/primary.mp4",
        attemptedStreams: 1,
        errors: [],
      },
      attemptedStreams: 1,
      errors: [],
      remainingStreams: [fallback],
    });

    const result = await playBest({
      type: "movie",
      id: "tt123",
      title: "Example Movie",
      poster: "https://images.example.test/poster.jpg",
    });

    expect(createPlan).toHaveBeenCalledWith({
      type: "movie",
      id: "tt123",
      season: undefined,
      episode: undefined,
      action: "play",
    });
    expect(result).toMatchObject({
      ok: true,
      stream: {
        url: "https://cdn.example.test/primary.mp4",
        title: "Primary",
      },
      mediaInfo: {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
        poster: "https://images.example.test/poster.jpg",
      },
      fallbackStreams: [fallback],
      runtimeState: "buffering",
      attemptedStreams: 1,
      resolveErrors: [],
    });
  });

  it("maps not-found plans to NO_SOURCES without resolving streams", async () => {
    createPlan.mockResolvedValueOnce({
      state: "notFound",
      userMessage: "No sources were returned.",
    });

    const result = await playBest({
      type: "movie",
      id: "tt404",
      title: "Missing Movie",
    });

    expect(resolvePlan).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "NO_SOURCES",
        message: "No sources were returned.",
        retryable: false,
        shouldFallback: false,
      },
      runtimeState: "failed_no_sources",
      attemptedStreams: 0,
      resolveErrors: [],
    });
  });

  it("maps bridge-required plans to BRIDGE_UNAVAILABLE", async () => {
    createPlan.mockResolvedValueOnce({
      state: "needsBridge",
      userMessage: "Start the desktop bridge to play torrent sources.",
    });

    const result = await playBest({
      type: "series",
      id: "tt123:1:2",
      title: "Example Show",
      season: 1,
      episode: 2,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "BRIDGE_UNAVAILABLE",
        retryable: true,
        shouldFallback: false,
      },
      runtimeState: "failed_bridge_unavailable",
    });
  });

  it("maps broken bridge plans to BRIDGE_UNSUPPORTED", async () => {
    createPlan.mockResolvedValueOnce({
      state: "bridgeUnavailable",
      userMessage: "Bridge is running but the streaming engine is unavailable.",
    });

    const result = await playBest({
      type: "movie",
      id: "tt123",
      title: "Example Movie",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "BRIDGE_UNSUPPORTED",
        retryable: false,
        shouldFallback: false,
      },
      runtimeState: "failed_bridge_unsupported",
    });
  });

  it("maps resolver peer failures to NO_PEERS", async () => {
    createPlan.mockResolvedValueOnce({
      state: "ready",
      plan: {
        mode: "bridge",
        selectedCandidate: {
          id: "torrent",
          kind: "torrent",
          stream: { infoHash: "abc123", title: "Torrent" },
          riskFlags: [],
        },
      },
    });
    resolvePlan.mockResolvedValueOnce({
      resolved: null,
      attemptedStreams: 1,
      errors: ["No peers found"],
      remainingStreams: [],
    });

    const result = await playBest({
      type: "movie",
      id: "tt123",
      title: "Example Movie",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "NO_PEERS",
        shouldFallback: true,
      },
      runtimeState: "failed_no_peers",
      attemptedStreams: 1,
      resolveErrors: ["No peers found"],
    });
  });

  it("maps resolver codec failures to UNSUPPORTED_CODEC", async () => {
    createPlan.mockResolvedValueOnce({
      state: "ready",
      plan: {
        mode: "direct",
        selectedCandidate: {
          id: "hevc",
          kind: "direct",
          stream: { url: "https://cdn.example.test/hevc.mkv" },
          riskFlags: [],
        },
      },
    });
    resolvePlan.mockResolvedValueOnce({
      resolved: null,
      attemptedStreams: 1,
      errors: ["Unsupported codec h265"],
      remainingStreams: [],
    });

    const result = await playBest({
      type: "movie",
      id: "tt123",
      title: "Example Movie",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "UNSUPPORTED_CODEC",
        shouldFallback: true,
      },
      runtimeState: "failed_unsupported_codec",
    });
  });
});
