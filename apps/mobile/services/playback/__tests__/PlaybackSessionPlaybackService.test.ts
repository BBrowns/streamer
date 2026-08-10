import * as Crypto from "expo-crypto";
import type {
  BridgeJobResponseV1,
  DeviceProfile,
  PlaybackDelivery,
  PlaybackExecutionTarget,
  PlaybackRoute,
  PlaybackRuntimeError,
  Stream,
} from "@streamer/shared";
import {
  makePlaybackPlan,
  makePlaybackPlanV3,
  makePlannedMediaCandidate,
  makePlannedMediaCandidateV3,
} from "../../../test-utils/playbackPlan";
import { usePlaybackSessionStore } from "../../../stores/playbackSessionStore";
import {
  StreamEngineCancellationError,
  type GatewayJobProgress,
  type IStreamEngine,
  type StreamEngineEventMap,
} from "../../streamEngine/IStreamEngine";
import { streamEngineManager } from "../../streamEngine/StreamEngineManager";
import * as BridgeClientModule from "../../bridge/BridgeClient";
import {
  SourcePreparer,
  type PreparedSource,
  type SourcePreparationRequest,
} from "../../sourcePreparation";
import {
  advanceCastSessionAfterFailure,
  advancePlaybackSessionAfterFailure,
  cancelPlaybackSession,
  getActivePlaybackSourceRuntime,
  markPlaybackSessionBuffering,
  markPlaybackSessionPlaying,
  resolveCastSession,
  resolveDownloadSession,
  resolvePlaybackSession,
} from "../PlaybackSessionPlaybackService";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(),
}));

jest.mock("../../streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    resolveEngine: jest.fn(),
    getBridgeUrl: jest.fn(() => "http://192.168.1.25:11470"),
    bridgeAvailable: true,
    bridgeStatus: "available",
  },
}));

const PRIMARY_PLAN_ID = "00000000-0000-4000-8000-000000000101";
const FALLBACK_PLAN_ID = "00000000-0000-4000-8000-000000000102";
const GATEWAY_JOB_ID = "00000000-0000-4000-8000-000000000301";
const BRIDGE_JOB_ID = "00000000-0000-4000-8000-000000000302";

const deviceProfile: DeviceProfile = {
  platform: "ios",
  maxQuality: "1080p",
  network: "local",
  supports: {
    h264: true,
    h265: true,
    av1: false,
    mp4: true,
    mkv: false,
    hls: true,
    dolbyVision: false,
    aac: true,
    ac3: false,
    eac3: false,
  },
};

function installUuidMock() {
  let value = 1;
  jest
    .mocked(Crypto.randomUUID)
    .mockImplementation(
      () =>
        `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
    );
}

function makePlan(
  primary: Stream,
  fallback?: Stream,
  action: "play" | "download" | "cast" = "play",
) {
  const getKind = (stream: Stream) =>
    stream.infoHash
      ? "torrent"
      : stream.externalUrl
        ? "external"
        : stream.url?.includes(".m3u8")
          ? "hls"
          : "direct";
  return makePlaybackPlan({
    action,
    state: "ready",
    plan: {
      mode: primary.infoHash ? "bridge" : "direct",
      selectedCandidate: makePlannedMediaCandidate({
        id: PRIMARY_PLAN_ID,
        kind: getKind(primary),
        stream: primary,
        requiresBridge: !!primary.infoHash,
        actionEligibility: { action, eligible: true },
      }),
      fallbackCandidates: fallback
        ? [
            makePlannedMediaCandidate({
              id: FALLBACK_PLAN_ID,
              kind: getKind(fallback),
              stream: fallback,
              rank: 1,
              actionEligibility: { action, eligible: true },
            }),
          ]
        : [],
    },
  });
}

function createSession(
  primary: Stream,
  fallback?: Stream,
  action: "play" | "download" | "cast" = "play",
) {
  return usePlaybackSessionStore.getState().createSession({
    plan: makePlan(primary, fallback, action),
    content: { type: "movie", id: "tt123" },
    deviceProfile,
    bridge: { status: "available" },
  });
}

function makeV3Candidate(
  stream: Stream,
  options: {
    id?: string;
    rank?: number;
    action?: "play" | "download" | "cast";
    delivery?: PlaybackDelivery;
    executionTarget?: PlaybackExecutionTarget;
  } = {},
) {
  const id = options.id ?? PRIMARY_PLAN_ID;
  const action = options.action ?? "play";
  const executionTarget = options.executionTarget ?? "on-device";
  const delivery =
    options.delivery ?? (stream.url?.includes(".m3u8") ? "hls" : "direct");
  return makePlannedMediaCandidateV3({
    id,
    rank: options.rank ?? 0,
    kind: stream.infoHash ? "torrent" : delivery === "hls" ? "hls" : "direct",
    stream,
    requiresBridge: executionTarget !== "on-device",
    requiresRemux:
      delivery === "progressive-fmp4" || delivery === "seekable-cache",
    actionEligibility: { action, eligible: true },
    route: {
      candidateId: id,
      executionTarget,
      delivery,
      capabilities: {
        seek: delivery === "progressive-fmp4" ? "preparing" : "immediate",
        audioTracks: delivery === "hls",
        embeddedSubtitles: delivery === "hls",
        externalSubtitles: true,
        cast: true,
        offline: delivery === "direct" || delivery === "seekable-cache",
        thumbnails: false,
      },
    },
  });
}

function createV3Session(
  primary: Stream,
  options: {
    fallback?: Stream;
    primaryDelivery?: PlaybackDelivery;
    primaryExecutionTarget?: PlaybackExecutionTarget;
  } = {},
) {
  const selectedCandidate = makeV3Candidate(primary, {
    delivery: options.primaryDelivery,
    executionTarget: options.primaryExecutionTarget,
  });
  const fallbackCandidate = options.fallback
    ? makeV3Candidate(options.fallback, {
        id: FALLBACK_PLAN_ID,
        rank: 1,
      })
    : undefined;
  const fallbackCandidates = fallbackCandidate ? [fallbackCandidate] : [];
  return usePlaybackSessionStore.getState().createSession({
    plan: makePlaybackPlanV3({
      state: "ready",
      selectedCandidate,
      fallbackCandidates,
      orderedCandidates: [selectedCandidate, ...fallbackCandidates],
    }),
    content: { type: "movie", id: "tt123" },
    deviceProfile,
    bridge: { status: "available" },
  });
}

function makeEngine(
  getPlaybackUri: (stream: Stream) => Promise<string>,
): IStreamEngine & {
  emitGateway: (progress: GatewayJobProgress) => void;
  stop: jest.Mock;
} {
  const listeners = new Map<
    keyof StreamEngineEventMap,
    Set<(data: any) => void>
  >();
  return {
    canPlay: () => true,
    getPlaybackUri: jest.fn(getPlaybackUri),
    getEngineType: () => "test",
    getAudioTracks: () => [],
    getSubtitles: () => [],
    setSubtitle: () => {},
    on: (event, callback) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
    },
    off: (event, callback) => {
      listeners.get(event)?.delete(callback);
    },
    stop: jest.fn(),
    emitGateway: (progress) => {
      listeners.get("gateway")?.forEach((callback) => callback(progress));
    },
  };
}

describe("PlaybackSessionPlaybackService", () => {
  const resolveEngine =
    streamEngineManager.resolveEngine as jest.MockedFunction<
      typeof streamEngineManager.resolveEngine
    >;

  beforeEach(() => {
    installUuidMock();
    jest.clearAllMocks();
    installUuidMock();
    usePlaybackSessionStore.getState().clearAllSessions();
    streamEngineManager.bridgeAvailable = true;
    streamEngineManager.bridgeStatus = "available";
  });

  afterEach(() => {
    const sessionId = usePlaybackSessionStore.getState().activeSessionId;
    if (sessionId) cancelPlaybackSession(sessionId, "Test cleanup.");
    usePlaybackSessionStore.getState().clearAllSessions();
  });

  it.each([
    ["direct", "https://cdn.example.test/movie.mp4"],
    ["hls", "https://cdn.example.test/master.m3u8"],
  ] as const)(
    "executes a Planner v3 %s route without legacy engine resolution",
    async (delivery, url) => {
      const session = createV3Session({ url, title: delivery } as Stream, {
        primaryDelivery: delivery,
      });

      const result = await resolvePlaybackSession(session.id);

      expect(result).toMatchObject({
        ok: true,
        uri: url,
        route: {
          executionTarget: "on-device",
          delivery,
        },
      });
      expect(
        result.ok
          ? getActivePlaybackSourceRuntime(session.id, result.attemptId)
          : null,
      ).toMatchObject({
        route: {
          executionTarget: "on-device",
          delivery,
        },
        runtime: expect.objectContaining({
          getEngineType: expect.any(Function),
        }),
      });
      expect(resolveEngine).not.toHaveBeenCalled();
    },
  );

  it("adopts one Planner v3 bridge job as the session-owned playback runtime", async () => {
    const readyJob: BridgeJobResponseV1 = {
      protocolVersion: 1,
      job: {
        id: BRIDGE_JOB_ID,
        state: "ready",
        phase: "ready",
        delivery: "progressive-fmp4",
        peerCount: 4,
        readinessProgress: 1,
        elapsedMs: 100,
        readyTimeoutMs: 45_000,
        media: {
          container: "mp4",
          remuxed: true,
          seek: "preparing",
          seekableCache: { status: "preparing" },
        },
        stream: {
          path: `/api/bridge/v1/jobs/${BRIDGE_JOB_ID}/stream?expires=4102444800000&signature=signed`,
          expiresAt: "2100-01-01T00:00:00.000Z",
        },
      },
    };
    const bridgeClient = {
      createJob: jest.fn().mockResolvedValue(readyJob),
      getJob: jest.fn().mockResolvedValue(readyJob),
      cancelJob: jest.fn().mockResolvedValue(null),
      getCapabilities: jest.fn(),
      getJobMetrics: jest.fn(),
      getTrackCatalog: jest.fn(),
      getSubtitleDocument: jest.fn(),
      getThumbnail: jest.fn(),
    };
    const getBridgeClient = jest
      .spyOn(BridgeClientModule, "getBridgeClient")
      .mockReturnValue(
        bridgeClient as unknown as ReturnType<
          typeof BridgeClientModule.getBridgeClient
        >,
      );
    const session = createV3Session(
      {
        infoHash: "0123456789abcdef0123456789abcdef01234567",
        fileIdx: 3,
        title: "Bridge source",
      } as Stream,
      {
        primaryDelivery: "progressive-fmp4",
        primaryExecutionTarget: "paired-bridge",
      },
    );

    try {
      const result = await resolvePlaybackSession(session.id);

      expect(result).toMatchObject({
        ok: true,
        bridgeJobId: BRIDGE_JOB_ID,
        route: {
          executionTarget: "paired-bridge",
          delivery: "progressive-fmp4",
        },
        runtime: expect.objectContaining({
          getEngineType: expect.any(Function),
        }),
      });
      if (!result.ok) return;
      expect(result.runtime?.getEngineType()).toBe("bridge-v1");
      expect(result.runtime?.canPlay(result.stream)).toBe(true);
      expect(
        getActivePlaybackSourceRuntime(session.id, result.attemptId),
      ).toMatchObject({
        bridgeJobId: BRIDGE_JOB_ID,
        runtime: result.runtime,
      });
      expect(resolveEngine).not.toHaveBeenCalled();
      expect(bridgeClient.createJob).toHaveBeenCalledTimes(1);

      cancelPlaybackSession(session.id, "Test cleanup.");
      await Promise.resolve();
      expect(bridgeClient.cancelJob).toHaveBeenCalledTimes(1);
      expect(
        getActivePlaybackSourceRuntime(session.id, result.attemptId),
      ).toBeNull();
    } finally {
      getBridgeClient.mockRestore();
    }
  });

  it("exposes an active lease only to its exact playback attempt", async () => {
    const session = createV3Session({
      url: "https://cdn.example.test/movie.mp4",
      title: "Direct",
    } as Stream);

    const result = await resolvePlaybackSession(session.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      getActivePlaybackSourceRuntime(session.id, "older-attempt"),
    ).toBeNull();
    const runtime = getActivePlaybackSourceRuntime(
      session.id,
      result.attemptId,
    );
    expect(runtime).toMatchObject({
      route: { candidateId: PRIMARY_PLAN_ID, delivery: "direct" },
      runtime: expect.any(Object),
    });
    expect(Object.keys(runtime!).sort()).toEqual(["route", "runtime"]);
  });

  it("makes the attempt-bound runtime accessor empty as soon as cancellation releases the lease", async () => {
    const session = createV3Session({
      url: "https://cdn.example.test/movie.mp4",
      title: "Direct",
    } as Stream);
    const result = await resolvePlaybackSession(session.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      getActivePlaybackSourceRuntime(session.id, result.attemptId),
    ).not.toBeNull();

    cancelPlaybackSession(session.id, "User left.");

    expect(
      getActivePlaybackSourceRuntime(session.id, result.attemptId),
    ).toBeNull();
  });

  it.each(["attempt", "route"] as const)(
    "releases and rejects a prepared source whose exact %s binding does not match",
    async (mismatch) => {
      const session = createV3Session({
        url: "https://cdn.example.test/movie.mp4",
        title: "Direct",
      } as Stream);
      const release = jest.fn(async () => undefined);
      let capturedRequest: SourcePreparationRequest | undefined;
      const prepareSpy = jest
        .spyOn(SourcePreparer.prototype, "prepare")
        .mockImplementation(async (request: SourcePreparationRequest) => {
          capturedRequest = request;
          const preparedRoute: PlaybackRoute | undefined =
            mismatch === "route" && request.route
              ? {
                  ...request.route,
                  capabilities: {
                    ...request.route.capabilities,
                    thumbnails: !request.route.capabilities.thumbnails,
                  },
                }
              : request.route;
          return {
            uri: request.candidate.stream.url!,
            stream: request.candidate.stream,
            attemptId:
              mismatch === "attempt"
                ? `${request.attemptId}-mismatch`
                : request.attemptId,
            route: preparedRoute,
            released: false,
            release,
          } satisfies PreparedSource;
        });

      try {
        const result = await resolvePlaybackSession(session.id);

        expect(capturedRequest).toBeDefined();
        expect(result).toMatchObject({
          ok: false,
          error: { code: "SOURCE_UNAVAILABLE", shouldFallback: false },
        });
        expect(release).toHaveBeenCalledTimes(1);
        expect(
          getActivePlaybackSourceRuntime(
            session.id,
            capturedRequest!.attemptId,
          ),
        ).toBeNull();
      } finally {
        prepareSpy.mockRestore();
      }
    },
  );

  it("releases a prepared source that arrives after the session was cancelled", async () => {
    const session = createV3Session({
      url: "https://cdn.example.test/movie.mp4",
      title: "Direct",
    } as Stream);
    const release = jest.fn(async () => undefined);
    let capturedRequest: SourcePreparationRequest | undefined;
    let resolvePreparation!: (source: PreparedSource) => void;
    const prepareSpy = jest
      .spyOn(SourcePreparer.prototype, "prepare")
      .mockImplementation(
        (request: SourcePreparationRequest) =>
          new Promise<PreparedSource>((resolve) => {
            capturedRequest = request;
            resolvePreparation = resolve;
          }),
      );

    try {
      const resolution = resolvePlaybackSession(session.id);
      for (let turn = 0; turn < 10 && !capturedRequest; turn += 1) {
        await Promise.resolve();
      }
      expect(capturedRequest).toBeDefined();
      cancelPlaybackSession(session.id, "User left before preparation.");

      resolvePreparation({
        uri: capturedRequest!.candidate.stream.url!,
        stream: capturedRequest!.candidate.stream,
        attemptId: capturedRequest!.attemptId,
        route: capturedRequest!.route,
        released: false,
        release,
      });

      await expect(resolution).resolves.toMatchObject({ ok: false });
      expect(release).toHaveBeenCalledTimes(1);
      expect(
        getActivePlaybackSourceRuntime(session.id, capturedRequest!.attemptId),
      ).toBeNull();
    } finally {
      prepareSpy.mockRestore();
    }
  });

  it("fails closed for an unsupported Planner v3 route without invoking legacy resolution", async () => {
    const primary = {
      url: "https://cdn.example.test/movie.mp4",
      title: "Unsupported route",
    } as Stream;
    const session = createV3Session(primary, {
      primaryDelivery: "range-http",
    });

    const result = await resolvePlaybackSession(session.id);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SOURCE_UNAVAILABLE", shouldFallback: false },
    });
    expect(resolveEngine).not.toHaveBeenCalled();
    expect(usePlaybackSessionStore.getState().sessions[session.id].status).toBe(
      "failed",
    );
  });

  it("records a failed primary attempt and resolves the next planned candidate", async () => {
    const primary = { infoHash: "abc123", title: "Torrent" } as Stream;
    const fallback = {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Direct fallback",
    } as Stream;
    const primaryEngine = makeEngine(async () => {
      throw new Error("No peers found");
    });
    const fallbackEngine = makeEngine(async () => fallback.url!);
    resolveEngine.mockImplementation((stream) =>
      stream.infoHash ? primaryEngine : fallbackEngine,
    );
    const session = createSession(primary, fallback);

    const result = await resolvePlaybackSession(session.id);

    expect(result).toMatchObject({
      ok: true,
      stream: fallback,
      uri: fallback.url,
      fallbackReason:
        "This source did not find enough peers to start playback.",
    });
    const updated = usePlaybackSessionStore.getState().sessions[session.id];
    expect(updated.status).toBe("ready");
    expect(updated.attempts).toMatchObject([
      { status: "failed", error: { code: "NO_PEERS" } },
      { status: "ready" },
    ]);
    expect(updated.eventLog.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "attempt_failed",
        "fallback_started",
        "attempt_ready",
      ]),
    );
  });

  it("uses progressive fragmented remux only for the primary Play action", async () => {
    const source = { infoHash: "abc123", title: "Torrent" } as Stream;
    const engine = makeEngine(async () => "http://bridge.test/stream");
    resolveEngine.mockReturnValue(engine);
    const session = createSession(source);

    const result = await resolvePlaybackSession(session.id);

    expect(result).toMatchObject({
      ok: true,
      uri: "http://bridge.test/stream",
    });
    expect(engine.getPlaybackUri).toHaveBeenCalledWith(
      expect.objectContaining({
        infoHash: "abc123",
        behaviorHints: expect.objectContaining({
          remuxStrategy: "progressive-fmp4",
        }),
      }),
    );
  });

  it("treats engine cancellation as cancellation without failure or fallback", async () => {
    const primary = { infoHash: "abc123", title: "Torrent" } as Stream;
    const fallback = {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Direct fallback",
    } as Stream;
    const primaryEngine = makeEngine(async () => {
      throw new StreamEngineCancellationError();
    });
    const fallbackEngine = makeEngine(async () => fallback.url!);
    resolveEngine.mockImplementation((stream) =>
      stream.infoHash ? primaryEngine : fallbackEngine,
    );
    const session = createSession(primary, fallback);

    const result = await resolvePlaybackSession(session.id);

    expect(result).toMatchObject({
      ok: false,
      error: { shouldFallback: false },
    });
    expect(fallbackEngine.getPlaybackUri).not.toHaveBeenCalled();
    const updated = usePlaybackSessionStore.getState().sessions[session.id];
    expect(updated.status).toBe("cancelled");
    expect(updated.terminalError).toBeUndefined();
    expect(updated.attempts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "failed" })]),
    );
    expect(updated.eventLog.map((event) => event.type)).not.toEqual(
      expect.arrayContaining(["attempt_failed", "fallback_started"]),
    );
  });

  it("records gateway progress without persisting source URLs", async () => {
    const primary = { infoHash: "abc123", title: "Torrent" } as Stream;
    const engine = makeEngine(async () => {
      engine.emitGateway({
        id: GATEWAY_JOB_ID,
        state: "preparing",
        phase: "finding_peers",
        progress: 0.25,
        peerCount: 2,
      });
      return `http://bridge.test/api/gateway/jobs/${GATEWAY_JOB_ID}/stream`;
    });
    resolveEngine.mockReturnValue(engine);
    const session = createSession(primary);

    const result = await resolvePlaybackSession(session.id);

    expect(result.ok).toBe(true);
    const updated = usePlaybackSessionStore.getState().sessions[session.id];
    expect(updated.gatewayJobId).toBe(GATEWAY_JOB_ID);
    expect(updated.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "gateway_progress",
          phase: "finding_peers",
          progress: 0.25,
          peerCount: 2,
        }),
      ]),
    );
    expect(JSON.stringify(updated)).not.toContain("bridge.test");
  });

  it("resolves a direct download through a download session", async () => {
    const primary = {
      url: "https://cdn.example.test/movie.mp4",
      title: "Direct download",
    } as Stream;
    const engine = makeEngine(async () => primary.url!);
    resolveEngine.mockReturnValue(engine);
    const session = createSession(primary, undefined, "download");

    const result = await resolveDownloadSession(session.id);

    expect(result).toMatchObject({
      ok: true,
      stream: primary,
      uri: primary.url,
      eligibility: {
        mode: "direct-file",
        canDownload: true,
        offlinePlayable: true,
      },
    });
    expect(
      usePlaybackSessionStore.getState().sessions[session.id],
    ).toMatchObject({
      action: "download",
      status: "ready",
      attempts: [{ status: "ready" }],
    });
  });

  it("skips HLS for offline download and resolves the next eligible candidate", async () => {
    const primary = {
      url: "https://cdn.example.test/master.m3u8",
      title: "Streaming only",
    } as Stream;
    const fallback = {
      url: "https://cdn.example.test/movie.mp4",
      title: "Offline file",
    } as Stream;
    const fallbackEngine = makeEngine(async () => fallback.url!);
    resolveEngine.mockReturnValue(fallbackEngine);
    const session = createSession(primary, fallback, "download");

    const result = await resolveDownloadSession(session.id);

    expect(result).toMatchObject({
      ok: true,
      stream: fallback,
      eligibility: { mode: "direct-file", offlinePlayable: true },
    });
    expect(resolveEngine).toHaveBeenCalledTimes(1);
    expect(
      usePlaybackSessionStore.getState().sessions[session.id].attempts,
    ).toMatchObject([
      { status: "failed", error: { code: "SOURCE_UNAVAILABLE" } },
      { status: "ready" },
    ]);
  });

  it("records bridge preparation for a torrent download", async () => {
    const primary = { infoHash: "abc123", title: "Torrent" } as Stream;
    const engine = makeEngine(async () => {
      engine.emitGateway({
        id: GATEWAY_JOB_ID,
        state: "preparing",
        phase: "finding_peers",
        progress: 0.25,
        peerCount: 2,
      });
      return `http://bridge.test/api/gateway/jobs/${GATEWAY_JOB_ID}/stream`;
    });
    resolveEngine.mockReturnValue(engine);
    const session = createSession(primary, undefined, "download");

    const result = await resolveDownloadSession(session.id);

    expect(result).toMatchObject({
      ok: true,
      eligibility: {
        mode: "bridge-torrent",
        canDownload: true,
        offlinePlayable: true,
      },
    });
    expect(
      usePlaybackSessionStore.getState().sessions[session.id].eventLog,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "gateway_progress",
          phase: "finding_peers",
          progress: 0.25,
        }),
      ]),
    );
  });

  it("resolves a cast candidate using the cast device profile instead of the local web codec check", async () => {
    const primary = {
      url: "https://cdn.example.test/movie.mp4",
      title: "Movie H.265",
    } as Stream;
    const engine = makeEngine(async () => primary.url!);
    resolveEngine.mockReturnValue(engine);
    const session = createSession(primary, undefined, "cast");

    const result = await resolveCastSession(session.id);

    expect(result).toMatchObject({
      ok: true,
      stream: primary,
      uri: primary.url,
    });
    expect(
      usePlaybackSessionStore.getState().sessions[session.id],
    ).toMatchObject({
      action: "cast",
      status: "ready",
      attempts: [{ status: "ready" }],
    });
  });

  it("falls back to the next cast candidate after a display rejects a ready source", async () => {
    const primary = {
      url: "https://cdn.example.test/primary.mp4",
      title: "Primary",
    } as Stream;
    const fallback = {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Fallback",
    } as Stream;
    const primaryEngine = makeEngine(async () => primary.url!);
    const fallbackEngine = makeEngine(async () => fallback.url!);
    resolveEngine.mockImplementation((stream) =>
      stream.url === primary.url ? primaryEngine : fallbackEngine,
    );
    const session = createSession(primary, fallback, "cast");
    const first = await resolveCastSession(session.id);
    expect(first.ok).toBe(true);

    const error: PlaybackRuntimeError = {
      code: "SOURCE_UNAVAILABLE",
      message: "Display rejected source.",
      retryable: true,
      shouldFallback: true,
    };
    const result =
      first.ok &&
      (await advanceCastSessionAfterFailure(
        session.id,
        first.candidateId,
        first.attemptId,
        error,
      ));

    expect(result).toMatchObject({
      ok: true,
      uri: fallback.url,
    });
    expect(
      usePlaybackSessionStore.getState().sessions[session.id].attempts,
    ).toMatchObject([
      { status: "failed", error: { code: "SOURCE_UNAVAILABLE" } },
      { status: "ready" },
    ]);
    expect(primaryEngine.stop).toHaveBeenCalled();
  });

  it("rejects external browser downloads as unverified offline content", async () => {
    const primary = {
      externalUrl: "https://downloads.example.test/movie.mp4",
      title: "External download",
    } as Stream;
    const session = createSession(primary, undefined, "download");

    const result = await resolveDownloadSession(session.id);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "SOURCE_UNAVAILABLE",
        shouldFallback: false,
      },
    });
    expect(resolveEngine).not.toHaveBeenCalled();
    expect(
      usePlaybackSessionStore.getState().sessions[session.id],
    ).toMatchObject({
      status: "failed",
    });
  });

  it("marks a ready attempt failed and falls back after a first-frame error", async () => {
    const primary = {
      url: "https://cdn.example.test/primary.mp4",
      title: "Primary",
    } as Stream;
    const fallback = {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Fallback",
    } as Stream;
    const primaryEngine = makeEngine(async () => primary.url!);
    const fallbackEngine = makeEngine(async () => fallback.url!);
    resolveEngine.mockImplementation((stream) =>
      stream.url === primary.url ? primaryEngine : fallbackEngine,
    );
    const session = createSession(primary, fallback);
    const first = await resolvePlaybackSession(session.id);
    expect(first.ok).toBe(true);

    const error: PlaybackRuntimeError = {
      code: "PLAYBACK_TIMEOUT",
      message: "Playback did not start in time.",
      retryable: true,
      shouldFallback: true,
    };
    const result =
      first.ok &&
      (await advancePlaybackSessionAfterFailure(
        session.id,
        first.candidateId,
        first.attemptId,
        error,
      ));

    expect(result).toMatchObject({
      ok: true,
      uri: fallback.url,
    });
    expect(
      usePlaybackSessionStore.getState().sessions[session.id].attempts,
    ).toMatchObject([
      { status: "failed", error: { code: "PLAYBACK_TIMEOUT" } },
      { status: "ready" },
    ]);
    expect(primaryEngine.stop).toHaveBeenCalled();
  });

  it("single-flights concurrent fallback advances for the same session", async () => {
    const primary = {
      url: "https://cdn.example.test/primary.mp4",
      title: "Primary",
    } as Stream;
    const fallback = {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Fallback",
    } as Stream;
    const primaryEngine = makeEngine(async () => primary.url!);
    let resolveFallback!: (uri: string) => void;
    const fallbackPreparation = new Promise<string>((resolve) => {
      resolveFallback = resolve;
    });
    const fallbackEngine = makeEngine(() => fallbackPreparation);
    resolveEngine.mockImplementation((stream) =>
      stream.url === primary.url ? primaryEngine : fallbackEngine,
    );
    const session = createSession(primary, fallback);
    const first = await resolvePlaybackSession(session.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const failure: PlaybackRuntimeError = {
      code: "PLAYBACK_TIMEOUT",
      message: "Playback did not start in time.",
      retryable: true,
      shouldFallback: true,
    };
    const firstAdvance = advancePlaybackSessionAfterFailure(
      session.id,
      first.candidateId,
      first.attemptId,
      failure,
    );
    const secondAdvance = advancePlaybackSessionAfterFailure(
      session.id,
      first.candidateId,
      first.attemptId,
      failure,
    );

    expect(secondAdvance).toBe(firstAdvance);
    for (
      let turn = 0;
      turn < 10 &&
      !jest.mocked(fallbackEngine.getPlaybackUri).mock.calls.length;
      turn += 1
    ) {
      await Promise.resolve();
    }
    expect(fallbackEngine.getPlaybackUri).toHaveBeenCalledTimes(1);
    resolveFallback(fallback.url!);
    await expect(Promise.all([firstAdvance, secondAdvance])).resolves.toEqual([
      expect.objectContaining({ ok: true, uri: fallback.url }),
      expect.objectContaining({ ok: true, uri: fallback.url }),
    ]);
    expect(
      usePlaybackSessionStore.getState().sessions[session.id].attempts,
    ).toHaveLength(2);
  });

  it("completes the golden path from first-frame timeout through fallback to playing", async () => {
    const primary = {
      url: "https://cdn.example.test/primary.mp4",
      title: "Primary",
    } as Stream;
    const fallback = {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Fallback",
    } as Stream;
    const primaryEngine = makeEngine(async () => primary.url!);
    const fallbackEngine = makeEngine(async () => fallback.url!);
    resolveEngine.mockImplementation((stream) =>
      stream.url === primary.url ? primaryEngine : fallbackEngine,
    );
    const session = createSession(primary, fallback);

    const first = await resolvePlaybackSession(session.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await advancePlaybackSessionAfterFailure(
      session.id,
      first.candidateId,
      first.attemptId,
      {
        code: "PLAYBACK_TIMEOUT",
        message: "Playback did not start in time.",
        retryable: true,
        shouldFallback: true,
      },
    );
    expect(second).toMatchObject({ ok: true, uri: fallback.url });
    if (!second.ok) return;

    markPlaybackSessionBuffering(session.id);
    markPlaybackSessionPlaying(session.id);

    const completedSession =
      usePlaybackSessionStore.getState().sessions[session.id];
    expect(completedSession).toMatchObject({
      status: "playing",
      selectedCandidateId: second.candidateId,
      attempts: [
        { status: "failed", error: { code: "PLAYBACK_TIMEOUT" } },
        { status: "ready" },
      ],
    });
    expect(completedSession.eventLog.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "fallback_started",
        "attempt_ready",
        "status_changed",
      ]),
    );
    expect(primaryEngine.stop).toHaveBeenCalled();
    expect(fallbackEngine.stop).not.toHaveBeenCalled();
  });

  it("fails the session clearly when all planned candidates fail", async () => {
    const primary = { infoHash: "abc123", title: "Torrent" } as Stream;
    const engine = makeEngine(async () => {
      throw new Error("No peers found");
    });
    resolveEngine.mockReturnValue(engine);
    const session = createSession(primary);

    const result = await resolvePlaybackSession(session.id);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "NO_PEERS", shouldFallback: false },
    });
    expect(
      usePlaybackSessionStore.getState().sessions[session.id],
    ).toMatchObject({
      status: "failed",
      terminalError: { code: "NO_PEERS", shouldFallback: false },
    });
  });

  it("classifies error-like gateway failures across runtime boundaries", async () => {
    const primary = { infoHash: "abc123", title: "Torrent" } as Stream;
    const engine = makeEngine(async () => {
      throw { message: "No peers found" };
    });
    resolveEngine.mockReturnValue(engine);
    const session = createSession(primary);

    const result = await resolvePlaybackSession(session.id);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "NO_PEERS", shouldFallback: false },
    });
  });

  it("uses a terminal no-playable-source error after mixed candidate failures", async () => {
    const primary = { infoHash: "abc123", title: "Torrent" } as Stream;
    const fallback = {
      url: "https://cdn.example.test/fallback.mp4",
      title: "Broken direct fallback",
    } as Stream;
    const primaryEngine = makeEngine(async () => {
      throw new Error("No peers found");
    });
    const fallbackEngine = makeEngine(async () => {
      throw new Error("Source did not return a playback URL.");
    });
    resolveEngine.mockImplementation((stream) =>
      stream.infoHash ? primaryEngine : fallbackEngine,
    );
    const session = createSession(primary, fallback);

    const result = await resolvePlaybackSession(session.id);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "NO_PLAYABLE_SOURCE",
        message: "No playable source worked for this title.",
        shouldFallback: false,
      },
    });
    expect(
      usePlaybackSessionStore.getState().sessions[session.id],
    ).toMatchObject({
      status: "failed",
      terminalError: {
        code: "NO_PLAYABLE_SOURCE",
        message: "No playable source worked for this title.",
        shouldFallback: false,
      },
      attempts: [
        { status: "failed", error: { code: "NO_PEERS" } },
        { status: "failed", error: { code: "SOURCE_UNAVAILABLE" } },
      ],
    });
  });

  it("enforces the planner timeout budget and stops a stalled engine", async () => {
    jest.useFakeTimers();
    try {
      const primary = {
        url: "https://cdn.example.test/stalled.mp4",
        title: "Stalled",
      } as Stream;
      const engine = makeEngine(() => new Promise<string>(() => undefined));
      resolveEngine.mockReturnValue(engine);
      const plan = makePlan(primary);
      plan.timeoutBudget.directProbeMs = 10;
      const session = usePlaybackSessionStore.getState().createSession({
        plan,
        content: { type: "movie", id: "tt123" },
        deviceProfile,
      });

      const resolution = resolvePlaybackSession(session.id);
      await jest.advanceTimersByTimeAsync(11);
      const result = await resolution;

      expect(result).toMatchObject({
        ok: false,
        error: { code: "PLAYBACK_TIMEOUT" },
      });
      expect(engine.stop).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("reports a session budget timeout without exhausting every remaining source", async () => {
    jest.useFakeTimers();
    try {
      const primary = {
        infoHash: "slow-torrent",
        title: "Slow torrent",
      } as Stream;
      const fallback = {
        url: "https://cdn.example.test/fallback.mp4",
        title: "Fallback",
      } as Stream;
      const primaryEngine = makeEngine(
        () => new Promise<string>(() => undefined),
      );
      const fallbackEngine = makeEngine(async () => fallback.url!);
      resolveEngine.mockImplementation((stream) =>
        stream.infoHash ? primaryEngine : fallbackEngine,
      );

      const plan = makePlan(primary, fallback);
      plan.timeoutBudget.totalMs = 10;
      const session = usePlaybackSessionStore.getState().createSession({
        plan,
        content: { type: "movie", id: "tt123" },
        deviceProfile,
      });

      const resolution = resolvePlaybackSession(session.id);
      await jest.advanceTimersByTimeAsync(11);
      const result = await resolution;

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "GATEWAY_TIMEOUT",
          message: expect.stringContaining("Sources were found"),
        },
      });
      expect(primaryEngine.stop).toHaveBeenCalled();
      expect(fallbackEngine.getPlaybackUri).not.toHaveBeenCalled();
      expect(
        usePlaybackSessionStore.getState().sessions[session.id],
      ).toMatchObject({
        status: "failed",
        terminalError: { code: "GATEWAY_TIMEOUT" },
        attempts: [{ status: "failed", error: { code: "GATEWAY_TIMEOUT" } }],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps an unknown-container torrent alive long enough for a gateway remux upgrade", async () => {
    jest.useFakeTimers();
    try {
      const source = {
        infoHash: "container-discovered-after-metadata",
        title: "Provider label without a container",
      } as Stream;
      const engine = makeEngine(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve("http://bridge.test/api/gateway/jobs/job-1/stream"),
              100,
            );
          }),
      );
      resolveEngine.mockReturnValue(engine);

      const plan = makePlan(source);
      const candidate = plan.plan!.selectedCandidate!;
      candidate.container = "unknown";
      candidate.requiresRemux = false;
      plan.timeoutBudget = {
        ...plan.timeoutBudget,
        totalMs: 200,
        bridgeConnectMs: 10,
        torrentMetadataMs: 20,
        peerDiscoveryMs: 30,
        remuxReadyMs: 100,
      };
      const session = usePlaybackSessionStore.getState().createSession({
        plan,
        content: { type: "movie", id: "tt123" },
        deviceProfile,
      });

      const resolution = resolvePlaybackSession(session.id);
      for (
        let attempt = 0;
        attempt < 10 && !jest.mocked(engine.getPlaybackUri).mock.calls.length;
        attempt += 1
      ) {
        await Promise.resolve();
      }
      expect(engine.getPlaybackUri).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(100);

      await expect(resolution).resolves.toMatchObject({
        ok: true,
        uri: "http://bridge.test/api/gateway/jobs/job-1/stream",
      });
      expect(engine.stop).not.toHaveBeenCalled();
      // The reducer timestamps use the fake clock. Clear the completed test
      // session before restoring real time so shared afterEach cleanup cannot
      // append an event with an earlier wall-clock timestamp.
      usePlaybackSessionStore.getState().clearAllSessions();
    } finally {
      jest.useRealTimers();
    }
  });

  it("cancels the active engine and session when the user leaves", async () => {
    const primary = {
      url: "https://cdn.example.test/primary.mp4",
      title: "Primary",
    } as Stream;
    const engine = makeEngine(async () => primary.url!);
    resolveEngine.mockReturnValue(engine);
    const session = createSession(primary);
    await resolvePlaybackSession(session.id);

    cancelPlaybackSession(session.id, "User left.");

    expect(engine.stop).toHaveBeenCalled();
    expect(
      usePlaybackSessionStore.getState().sessions[session.id],
    ).toMatchObject({
      status: "cancelled",
    });
  });

  it("fails with replan guidance when transient runtime candidates are missing", async () => {
    const primary = {
      url: "https://cdn.example.test/primary.mp4",
      title: "Primary",
    } as Stream;
    const session = createSession(primary);
    usePlaybackSessionStore.getState().clearRuntimeState(session.id);

    const result = await resolvePlaybackSession(session.id);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "Playback needs to be prepared again.",
      },
    });
    expect(resolveEngine).not.toHaveBeenCalled();
  });

  it("keeps a torrent timeout as the failure when engine cleanup rejects with cancellation", async () => {
    jest.useFakeTimers({
      doNotFake: ["Date"],
    });

    try {
      const primary = {
        infoHash: "abc123",
        title: "Slow torrent",
      } as Stream;

      const fallback = {
        url: "https://cdn.example.test/fallback.mp4",
        title: "Direct fallback",
      } as Stream;

      let rejectPrimary!: (error: unknown) => void;

      const primaryEngine = makeEngine(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectPrimary = reject;
          }),
      );

      primaryEngine.stop.mockImplementation(() => {
        rejectPrimary(new StreamEngineCancellationError());
      });

      const fallbackEngine = makeEngine(async () => fallback.url!);

      resolveEngine.mockImplementation((stream) =>
        stream.infoHash ? primaryEngine : fallbackEngine,
      );

      const session = createSession(primary, fallback);
      const resolution = resolvePlaybackSession(session.id);

      await jest.advanceTimersByTimeAsync(95_000);

      const result = await resolution;

      expect(result).toMatchObject({
        ok: true,
        uri: fallback.url,
      });

      expect(primaryEngine.stop).toHaveBeenCalled();
      expect(fallbackEngine.getPlaybackUri).toHaveBeenCalled();

      const updated = usePlaybackSessionStore.getState().sessions[session.id];

      expect(updated.status).toBe("ready");
      expect(updated.attempts[0]).toMatchObject({
        status: "failed",
        error: {
          code: "GATEWAY_TIMEOUT",
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
