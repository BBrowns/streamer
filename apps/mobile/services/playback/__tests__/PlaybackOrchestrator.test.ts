import * as Crypto from "expo-crypto";
import { getDownloadEligibility } from "../../downloadEligibility";
import { usePlaybackSessionStore } from "../../../stores/playbackSessionStore";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import {
  playBest,
  prepareDownload,
  prepareCast,
} from "../PlaybackOrchestrator";
import {
  createPlaybackPlanWithBridgeRetry,
  resolvePlaybackPlan,
} from "../PlaybackPlanService";

jest.mock("../PlaybackPlanService", () => ({
  createPlaybackPlanWithBridgeRetry: jest.fn(),
  resolvePlaybackPlan: jest.fn(),
}));

jest.mock("../../downloadEligibility", () => ({
  getDownloadEligibility: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(),
}));

describe("PlaybackOrchestrator", () => {
  const createPlan = createPlaybackPlanWithBridgeRetry as jest.MockedFunction<
    typeof createPlaybackPlanWithBridgeRetry
  >;
  const resolvePlan = resolvePlaybackPlan as jest.MockedFunction<
    typeof resolvePlaybackPlan
  >;
  const getEligibility = getDownloadEligibility as jest.MockedFunction<
    typeof getDownloadEligibility
  >;

  beforeEach(() => {
    let value = 1;
    jest
      .mocked(Crypto.randomUUID)
      .mockImplementation(
        () =>
          `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
      );
    jest.clearAllMocks();
    usePlaybackSessionStore.getState().clearAllSessions();
    getEligibility.mockReturnValue({
      mode: "direct-file",
      canDownload: true,
      offlinePlayable: true,
    });
  });

  afterEach(() => {
    usePlaybackSessionStore.getState().clearAllSessions();
  });

  it("creates a session for Play Best without resolving streams in the orchestrator", async () => {
    const plan = makePlaybackPlan({
      state: "ready",
      plan: {
        mode: "direct",
        selectedCandidate: makePlannedMediaCandidate({
          id: "00000000-0000-4000-8000-000000000101",
          kind: "direct",
          stream: {
            url: "https://cdn.example.test/primary.mp4",
            title: "Primary",
          },
        }),
        fallbackCandidates: [
          makePlannedMediaCandidate({
            id: "00000000-0000-4000-8000-000000000102",
            kind: "direct",
            rank: 1,
            stream: {
              url: "https://cdn.example.test/fallback.mp4",
              title: "Fallback",
            },
          }),
        ],
      },
    });

    createPlan.mockResolvedValueOnce(plan);

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
      runtimeState: "selecting_source",
      attemptedStreams: 0,
      resolveErrors: [],
    });
    expect(resolvePlan).not.toHaveBeenCalled();
    expect(result.ok && result.sessionId).toEqual(expect.any(String));
    expect(result.ok && result.candidateId).toEqual(expect.any(String));
    expect(
      result.ok &&
        usePlaybackSessionStore.getState().sessions[result.sessionId],
    ).toMatchObject({
      action: "play",
      status: "selecting_candidate",
      content: { type: "movie", id: "tt123" },
      candidates: [{ rank: 0 }, { rank: 1 }],
    });
  });

  it("maps not-found plans to NO_SOURCES without resolving streams", async () => {
    createPlan.mockResolvedValueOnce(
      makePlaybackPlan({
        state: "notFound",
        userMessage: "No sources were returned.",
      }),
    );

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
    expect(
      result.sessionId &&
        usePlaybackSessionStore.getState().sessions[result.sessionId],
    ).toMatchObject({
      status: "failed",
      terminalError: { code: "NO_SOURCES" },
    });
  });

  it("maps bridge-required plans to BRIDGE_UNAVAILABLE", async () => {
    createPlan.mockResolvedValueOnce(
      makePlaybackPlan({
        state: "needsBridge",
        userMessage: "Start the desktop bridge to play torrent sources.",
      }),
    );

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
    createPlan.mockResolvedValueOnce(
      makePlaybackPlan({
        state: "bridgeUnavailable",
        userMessage:
          "Bridge is running but the streaming engine is unavailable.",
      }),
    );

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

  it("prepares a direct download with the resolved URL and media info", async () => {
    const plan = makePlaybackPlan({
      action: "download",
      state: "ready",
      plan: {
        mode: "direct",
        selectedCandidate: makePlannedMediaCandidate({
          id: "direct",
          kind: "direct",
          stream: {
            url: "https://cdn.example.test/movie.mp4",
            title: "Direct",
          },
          actionEligibility: { action: "download", eligible: true },
        }),
      },
    });

    createPlan.mockResolvedValueOnce(plan);
    resolvePlan.mockResolvedValueOnce({
      resolved: {
        stream: {
          url: "https://cdn.example.test/movie.mp4",
          title: "Direct",
        },
        uri: "https://cdn.example.test/movie.mp4",
        attemptedStreams: 1,
        errors: [],
      },
      attemptedStreams: 1,
      errors: [],
      remainingStreams: [],
    });

    const result = await prepareDownload({
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
      action: "download",
    });
    expect(getEligibility).toHaveBeenCalledWith({
      url: "https://cdn.example.test/movie.mp4",
      title: "Direct",
    });
    expect(result).toMatchObject({
      ok: true,
      resolvedUrl: "https://cdn.example.test/movie.mp4",
      mediaInfo: {
        type: "movie",
        itemId: "tt123",
        title: "Example Movie",
        poster: "https://images.example.test/poster.jpg",
      },
      eligibility: {
        mode: "direct-file",
        canDownload: true,
        offlinePlayable: true,
      },
      runtimeState: "selecting_source",
    });
  });

  it("blocks download when the selected source is not offline eligible", async () => {
    createPlan.mockResolvedValueOnce(
      makePlaybackPlan({
        action: "download",
        state: "ready",
        plan: {
          mode: "hls",
          selectedCandidate: makePlannedMediaCandidate({
            id: "hls",
            kind: "hls",
            stream: { url: "https://cdn.example.test/master.m3u8" },
            actionEligibility: { action: "download", eligible: true },
          }),
        },
      }),
    );
    resolvePlan.mockResolvedValueOnce({
      resolved: {
        stream: { url: "https://cdn.example.test/master.m3u8" },
        uri: "https://cdn.example.test/master.m3u8",
        attemptedStreams: 1,
        errors: [],
      },
      attemptedStreams: 1,
      errors: [],
      remainingStreams: [],
    });
    getEligibility.mockReturnValueOnce({
      mode: "unsupported",
      canDownload: false,
      offlinePlayable: false,
      reason: "HLS streams are streaming-only in offline v1.",
    });

    const result = await prepareDownload({
      type: "movie",
      id: "tt123",
      title: "Example Movie",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "HLS streams are streaming-only in offline v1.",
        retryable: false,
        shouldFallback: true,
      },
      runtimeState: "failed_unknown",
      attemptedStreams: 1,
      resolveErrors: [],
    });
  });

  it("maps download resolver peer failures to NO_PEERS", async () => {
    createPlan.mockResolvedValueOnce(
      makePlaybackPlan({
        action: "download",
        state: "ready",
        plan: {
          mode: "bridge",
          selectedCandidate: makePlannedMediaCandidate({
            id: "torrent",
            kind: "torrent",
            stream: { infoHash: "abc123", title: "Torrent" },
            requiresBridge: true,
            actionEligibility: { action: "download", eligible: true },
          }),
        },
      }),
    );
    resolvePlan.mockResolvedValueOnce({
      resolved: null,
      attemptedStreams: 1,
      errors: ["No peers found"],
      remainingStreams: [],
    });

    const result = await prepareDownload({
      type: "movie",
      id: "tt123",
      title: "Example Movie",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "NO_PEERS",
        message: "Download is unavailable right now.",
        shouldFallback: true,
      },
      runtimeState: "failed_no_peers",
      attemptedStreams: 1,
      resolveErrors: ["No peers found"],
    });
  });

  it("prepares a cast with the resolved URL and media info", async () => {
    createPlan.mockResolvedValueOnce(
      makePlaybackPlan({
        action: "cast",
        state: "ready",
        plan: {
          mode: "direct",
          selectedCandidate: makePlannedMediaCandidate({
            id: "direct",
            kind: "direct",
            stream: { url: "http://example.com/stream.mp4", title: "Direct" },
            actionEligibility: { action: "cast", eligible: true },
          }),
        },
      }),
    );
    resolvePlan.mockResolvedValueOnce({
      resolved: {
        stream: { url: "http://example.com/stream.mp4", title: "Direct" },
        uri: "http://example.com/stream.mp4",
        attemptedStreams: 1,
        errors: [],
      },
      attemptedStreams: 1,
      errors: [],
      remainingStreams: [],
    });

    const result = await prepareCast({
      type: "movie",
      id: "tt123",
      title: "Example Movie",
    });

    expect(result).toMatchObject({
      ok: true,
      resolvedUrl: "http://example.com/stream.mp4",
      mediaInfo: { itemId: "tt123", title: "Example Movie" },
    });
    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cast" }),
    );
  });
});
