import * as Crypto from "expo-crypto";
import { usePlaybackSessionStore } from "../../../stores/playbackSessionStore";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import {
  playBest,
  playCandidate,
  prepareDownload,
  prepareCast,
} from "../PlaybackOrchestrator";
import {
  createPlaybackPlanWithBridgeRetry,
  resolvePlaybackPlan,
} from "../PlaybackPlanService";
import {
  resolveCastSession,
  resolveDownloadSession,
} from "../PlaybackSessionPlaybackService";

jest.mock("../PlaybackPlanService", () => ({
  createPlaybackPlanWithBridgeRetry: jest.fn(),
  resolvePlaybackPlan: jest.fn(),
}));

jest.mock("../PlaybackSessionPlaybackService", () => ({
  resolveCastSession: jest.fn(),
  resolveDownloadSession: jest.fn(),
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
  const resolveDownload = resolveDownloadSession as jest.MockedFunction<
    typeof resolveDownloadSession
  >;
  const resolveCast = resolveCastSession as jest.MockedFunction<
    typeof resolveCastSession
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

  it("maps a viewer-selected planner candidate into a normal playback session", async () => {
    const primary = makePlannedMediaCandidate({
      id: "00000000-0000-4000-8000-000000000111",
      kind: "direct",
      stream: {
        url: "https://cdn.example.test/primary.mp4",
        title: "Primary",
      },
    });
    const viewerChoice = makePlannedMediaCandidate({
      id: "00000000-0000-4000-8000-000000000112",
      kind: "direct",
      rank: 1,
      stream: {
        url: "https://cdn.example.test/viewer-choice.mp4",
        title: "Viewer choice",
      },
    });
    const plan = makePlaybackPlan({
      state: "ready",
      plan: {
        mode: "direct",
        selectedCandidate: primary,
        fallbackCandidates: [viewerChoice],
      },
    });

    const result = await playCandidate(
      {
        type: "movie",
        id: "tt123",
        title: "Example Movie",
      },
      plan,
      viewerChoice.id,
    );

    expect(result).toMatchObject({
      ok: true,
      stream: viewerChoice.stream,
      runtimeState: "selecting_source",
    });
    expect(resolvePlan).not.toHaveBeenCalled();
    expect(result.ok && result.candidateId).not.toBe(viewerChoice.id);
    expect(
      result.ok &&
        usePlaybackSessionStore
          .getState()
          .getRuntimeCandidate(result.sessionId, result.candidateId)?.id,
    ).toBe(viewerChoice.id);
    expect(
      result.ok &&
        usePlaybackSessionStore.getState().sessions[result.sessionId],
    ).toMatchObject({
      status: "selecting_candidate",
      selectedCandidateId: result.ok ? result.candidateId : undefined,
    });
    expect(
      result.ok &&
        usePlaybackSessionStore.getState().sessions[result.sessionId].eventLog,
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "fallback_started" }),
      ]),
    );
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
          id: "00000000-0000-4000-8000-000000000201",
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
    resolveDownload.mockResolvedValueOnce({
      ok: true,
      sessionId: "00000000-0000-4000-8000-000000000001",
      candidateId: "00000000-0000-4000-8000-000000000002",
      attemptId: "00000000-0000-4000-8000-000000000003",
      stream: {
        url: "https://cdn.example.test/movie.mp4",
        title: "Direct",
      },
      uri: "https://cdn.example.test/movie.mp4",
      eligibility: {
        mode: "direct-file",
        canDownload: true,
        offlinePlayable: true,
      },
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
      attemptedStreams: 0,
      resolveErrors: [],
    });
    expect(resolvePlan).not.toHaveBeenCalled();
    expect(resolveDownload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
    expect(result.ok && result.sessionId).toEqual(expect.any(String));
    expect(
      result.ok &&
        usePlaybackSessionStore.getState().sessions[result.sessionId],
    ).toMatchObject({
      action: "download",
      content: { type: "movie", id: "tt123" },
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
            id: "00000000-0000-4000-8000-000000000202",
            kind: "hls",
            stream: { url: "https://cdn.example.test/master.m3u8" },
            actionEligibility: { action: "download", eligible: true },
          }),
        },
      }),
    );
    resolveDownload.mockResolvedValueOnce({
      ok: false,
      sessionId: "00000000-0000-4000-8000-000000000001",
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "HLS streams are streaming-only in offline v1.",
        retryable: false,
        shouldFallback: false,
      },
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
        shouldFallback: false,
      },
      runtimeState: "failed_unknown",
      attemptedStreams: 0,
      resolveErrors: [],
    });
    expect(resolvePlan).not.toHaveBeenCalled();
  });

  it("maps download resolver peer failures to NO_PEERS", async () => {
    createPlan.mockResolvedValueOnce(
      makePlaybackPlan({
        action: "download",
        state: "ready",
        plan: {
          mode: "bridge",
          selectedCandidate: makePlannedMediaCandidate({
            id: "00000000-0000-4000-8000-000000000203",
            kind: "torrent",
            stream: { infoHash: "abc123", title: "Torrent" },
            requiresBridge: true,
            actionEligibility: { action: "download", eligible: true },
          }),
        },
      }),
    );
    resolveDownload.mockResolvedValueOnce({
      ok: false,
      sessionId: "00000000-0000-4000-8000-000000000001",
      error: {
        code: "NO_PEERS",
        message: "Download is unavailable right now.",
        retryable: true,
        shouldFallback: false,
      },
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
        shouldFallback: false,
      },
      runtimeState: "failed_no_peers",
      attemptedStreams: 0,
      resolveErrors: [],
    });
    expect(resolvePlan).not.toHaveBeenCalled();
  });

  it("prepares a cast with the resolved URL and media info", async () => {
    const stream = {
      url: "http://example.com/stream.mp4",
      title: "Direct",
    };
    createPlan.mockResolvedValueOnce(
      makePlaybackPlan({
        action: "cast",
        state: "ready",
        plan: {
          mode: "direct",
          selectedCandidate: makePlannedMediaCandidate({
            id: "00000000-0000-4000-8000-000000000301",
            kind: "direct",
            stream,
            actionEligibility: { action: "cast", eligible: true },
          }),
        },
      }),
    );
    resolveCast.mockResolvedValueOnce({
      ok: true,
      sessionId: "00000000-0000-4000-8000-000000000001",
      candidateId: "00000000-0000-4000-8000-000000000002",
      attemptId: "00000000-0000-4000-8000-000000000003",
      stream,
      uri: stream.url,
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
      sessionId: expect.any(String),
      candidateId: expect.any(String),
      attemptId: expect.any(String),
    });
    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cast" }),
    );
    expect(resolveCast).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
    expect(
      result.ok &&
        usePlaybackSessionStore.getState().sessions[result.sessionId],
    ).toMatchObject({
      action: "cast",
      castProfile: {
        supportsHls: true,
        supportsMp4: true,
        supportsMkv: false,
        canAccessLocalhost: false,
        requiresRemoteReachableUrl: true,
        remuxAllowed: true,
      },
    });
  });
});
