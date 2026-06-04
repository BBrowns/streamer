import * as Crypto from "expo-crypto";
import type {
  DeviceProfile,
  PlaybackRuntimeError,
  Stream,
} from "@streamer/shared";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import { usePlaybackSessionStore } from "../../../stores/playbackSessionStore";
import type {
  GatewayJobProgress,
  IStreamEngine,
  StreamEngineEventMap,
} from "../../streamEngine/IStreamEngine";
import { streamEngineManager } from "../../streamEngine/StreamEngineManager";
import {
  advancePlaybackSessionAfterFailure,
  cancelPlaybackSession,
  resolvePlaybackSession,
} from "../PlaybackSessionPlaybackService";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(),
}));

jest.mock("../../streamEngine/StreamEngineManager", () => ({
  streamEngineManager: {
    resolveEngine: jest.fn(),
  },
}));

const PRIMARY_PLAN_ID = "00000000-0000-4000-8000-000000000101";
const FALLBACK_PLAN_ID = "00000000-0000-4000-8000-000000000102";
const GATEWAY_JOB_ID = "00000000-0000-4000-8000-000000000301";

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

function makePlan(primary: Stream, fallback?: Stream) {
  return makePlaybackPlan({
    state: "ready",
    plan: {
      mode: primary.infoHash ? "bridge" : "direct",
      selectedCandidate: makePlannedMediaCandidate({
        id: PRIMARY_PLAN_ID,
        kind: primary.infoHash ? "torrent" : "direct",
        stream: primary,
        requiresBridge: !!primary.infoHash,
      }),
      fallbackCandidates: fallback
        ? [
            makePlannedMediaCandidate({
              id: FALLBACK_PLAN_ID,
              kind: "direct",
              stream: fallback,
              rank: 1,
            }),
          ]
        : [],
    },
  });
}

function createSession(primary: Stream, fallback?: Stream) {
  return usePlaybackSessionStore.getState().createSession({
    plan: makePlan(primary, fallback),
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
    setAudioTrack: () => {},
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
  });

  afterEach(() => {
    const sessionId = usePlaybackSessionStore.getState().activeSessionId;
    if (sessionId) cancelPlaybackSession(sessionId, "Test cleanup.");
    usePlaybackSessionStore.getState().clearAllSessions();
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
});
