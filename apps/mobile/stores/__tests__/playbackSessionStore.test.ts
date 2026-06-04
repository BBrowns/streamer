import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { DeviceProfile } from "@streamer/shared";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../test-utils/playbackPlan";
import { usePlaybackSessionStore } from "../playbackSessionStore";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(),
}));

const PLAN_CANDIDATE_ID = "00000000-0000-4000-8000-000000000101";
const PLAN_FALLBACK_ID = "00000000-0000-4000-8000-000000000102";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000201";
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

function makePlan() {
  return makePlaybackPlan({
    state: "ready",
    plan: {
      mode: "direct",
      selectedCandidate: makePlannedMediaCandidate({
        id: PLAN_CANDIDATE_ID,
        kind: "direct",
        stream: {
          url: "https://cdn.example.test/movie.mp4",
          title: "Direct source",
        },
      }),
    },
  });
}

function makePlanWithFallback() {
  return makePlaybackPlan({
    state: "ready",
    plan: {
      mode: "direct",
      selectedCandidate: makePlannedMediaCandidate({
        id: PLAN_CANDIDATE_ID,
        kind: "direct",
        stream: {
          url: "https://cdn.example.test/movie.mp4",
          title: "Direct source",
        },
      }),
      fallbackCandidates: [
        makePlannedMediaCandidate({
          id: PLAN_FALLBACK_ID,
          kind: "direct",
          stream: {
            url: "https://fallback.example.test/movie.mp4",
            title: "Fallback source",
          },
          rank: 1,
        }),
      ],
    },
  });
}

function installUuidMock() {
  let value = 1;
  jest
    .mocked(Crypto.randomUUID)
    .mockImplementation(
      () =>
        `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`,
    );
}

describe("playbackSessionStore", () => {
  beforeEach(async () => {
    installUuidMock();
    usePlaybackSessionStore.getState().clearAllSessions();
    await usePlaybackSessionStore.persist.clearStorage();
    jest.clearAllMocks();
    installUuidMock();
  });

  afterEach(() => {
    usePlaybackSessionStore.getState().clearAllSessions();
  });

  it("stores a persistence-safe session and keeps runtime candidates in memory", async () => {
    const session = usePlaybackSessionStore.getState().createSession({
      plan: makePlan(),
      content: { type: "movie", id: "tt123" },
      deviceProfile,
    });
    const sessionCandidateId = session.candidates[0].id;
    const state = usePlaybackSessionStore.getState();

    expect(state.activeSessionId).toBe(session.id);
    expect(sessionCandidateId).not.toBe(PLAN_CANDIDATE_ID);
    expect(
      state.getRuntimeCandidate(session.id, sessionCandidateId)?.stream.url,
    ).toBe("https://cdn.example.test/movie.mp4");
    expect(state.requiresReplan(session.id)).toBe(false);

    await Promise.resolve();
    const persisted = await AsyncStorage.getItem("playback-control-sessions");
    expect(persisted).toContain(session.id);
    expect(persisted).not.toContain("cdn.example.test");
    expect(persisted).not.toContain("movie.mp4");
  });

  it("marks persisted sessions for replan when transient runtime state is gone", () => {
    const session = usePlaybackSessionStore.getState().createSession({
      plan: makePlan(),
      content: { type: "movie", id: "tt123" },
      deviceProfile,
    });
    const listener = jest.fn();
    const unsubscribe = usePlaybackSessionStore.subscribe(listener);

    usePlaybackSessionStore.getState().clearRuntimeState(session.id);

    expect(listener).toHaveBeenCalled();
    expect(
      usePlaybackSessionStore.getState().hasRuntimeCandidates(session.id),
    ).toBe(false);
    expect(usePlaybackSessionStore.getState().requiresReplan(session.id)).toBe(
      true,
    );
    expect(
      usePlaybackSessionStore.getState().sessions[session.id],
    ).toBeDefined();
    unsubscribe();
  });

  it("dispatches typed events and creates attempts with opaque ids", () => {
    const session = usePlaybackSessionStore.getState().createSession({
      plan: makePlan(),
      content: { type: "movie", id: "tt123" },
      deviceProfile,
    });
    const attempt = usePlaybackSessionStore
      .getState()
      .startAttempt(session.id, session.candidates[0].id);

    expect(attempt.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(
      usePlaybackSessionStore.getState().sessions[session.id],
    ).toMatchObject({
      status: "attempting_candidate",
      attempts: [
        {
          id: attempt.id,
          candidateId: session.candidates[0].id,
          status: "attempting",
        },
      ],
    });
  });

  it("records gateway progress, fallback, and sanitized terminal errors", () => {
    const session = usePlaybackSessionStore.getState().createSession({
      plan: makePlanWithFallback(),
      content: { type: "movie", id: "tt123" },
      deviceProfile,
    });
    const primaryId = session.candidates[0].id;
    const fallbackId = session.candidates[1].id;

    usePlaybackSessionStore.getState().dispatchPlaybackEvent(session.id, {
      type: "attempt_started",
      attemptId: ATTEMPT_ID,
      candidateId: primaryId,
    });
    usePlaybackSessionStore.getState().dispatchPlaybackEvent(session.id, {
      type: "gateway_job_attached",
      gatewayJobId: GATEWAY_JOB_ID,
      candidateId: primaryId,
    });
    usePlaybackSessionStore
      .getState()
      .recordGatewayProgress(
        session.id,
        GATEWAY_JOB_ID,
        "finding_peers",
        0.25,
        2,
      );
    usePlaybackSessionStore.getState().dispatchPlaybackEvent(session.id, {
      type: "attempt_failed",
      attemptId: ATTEMPT_ID,
      candidateId: primaryId,
      error: {
        code: "NO_PEERS",
        message: "No peers found.",
        retryable: true,
        shouldFallback: true,
      },
    });
    usePlaybackSessionStore
      .getState()
      .recordFallback(session.id, primaryId, fallbackId, "No peers found.");
    usePlaybackSessionStore.getState().failSession(session.id, {
      code: "SOURCE_UNAVAILABLE",
      message: "No playable source remained.",
      retryable: false,
      shouldFallback: false,
      debugMessage: "https://signed.example.test/private-token",
    });

    const updated = usePlaybackSessionStore.getState().sessions[session.id];
    expect(updated.status).toBe("failed");
    expect(updated.selectedCandidateId).toBe(fallbackId);
    expect(updated.eventLog.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "gateway_progress",
        "fallback_started",
        "session_failed",
      ]),
    );
    expect(JSON.stringify(updated)).not.toContain("signed.example.test");
  });

  it("drops invalid persisted sessions during rehydration", async () => {
    await AsyncStorage.setItem(
      "playback-control-sessions",
      JSON.stringify({
        state: {
          sessions: {
            invalid: {
              id: "not-a-uuid",
              rawUrl: "https://cdn.example.test/private.mp4",
            },
          },
          activeSessionId: "invalid",
        },
        version: 1,
      }),
    );

    usePlaybackSessionStore.setState({
      sessions: {},
      activeSessionId: null,
    });
    await usePlaybackSessionStore.persist.rehydrate();

    expect(usePlaybackSessionStore.getState().sessions).toEqual({});
    expect(usePlaybackSessionStore.getState().activeSessionId).toBeNull();
  });

  it("keeps sessions created before async rehydration completes", async () => {
    const currentSession = usePlaybackSessionStore.getState().createSession({
      plan: makePlan(),
      content: { type: "movie", id: "tt-current" },
      deviceProfile,
    });

    await AsyncStorage.setItem(
      "playback-control-sessions",
      JSON.stringify({
        state: {
          sessions: {},
          activeSessionId: null,
        },
        version: 1,
      }),
    );
    await usePlaybackSessionStore.persist.rehydrate();

    expect(
      usePlaybackSessionStore.getState().sessions[currentSession.id],
    ).toBeDefined();
    expect(usePlaybackSessionStore.getState().activeSessionId).toBe(
      currentSession.id,
    );
  });

  it("removes terminal sessions without touching active workflows", () => {
    const first = usePlaybackSessionStore.getState().createSession({
      plan: makePlan(),
      content: { type: "movie", id: "tt-first" },
      deviceProfile,
    });
    const second = usePlaybackSessionStore.getState().createSession({
      plan: makePlan(),
      content: { type: "movie", id: "tt-second" },
      deviceProfile,
    });

    usePlaybackSessionStore.getState().dispatchPlaybackEvent(first.id, {
      type: "session_completed",
    });
    usePlaybackSessionStore.getState().clearTerminalSessions();

    expect(
      usePlaybackSessionStore.getState().sessions[first.id],
    ).toBeUndefined();
    expect(
      usePlaybackSessionStore.getState().sessions[second.id],
    ).toBeDefined();
    expect(usePlaybackSessionStore.getState().activeSessionId).toBe(second.id);
  });

  it("does not require a replan for terminal session history", () => {
    const session = usePlaybackSessionStore.getState().createSession({
      plan: makePlan(),
      content: { type: "movie", id: "tt123" },
      deviceProfile,
    });

    usePlaybackSessionStore.getState().cancelSession(session.id, "User left.");
    usePlaybackSessionStore.getState().clearRuntimeState(session.id);

    expect(usePlaybackSessionStore.getState().requiresReplan(session.id)).toBe(
      false,
    );
  });
});
