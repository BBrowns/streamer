import {
  playbackSessionSchema,
  type DeviceProfile,
  type PlaybackSessionEvent,
} from "@streamer/shared";
import {
  makePlaybackPlan,
  makePlannedMediaCandidate,
} from "../../../test-utils/playbackPlan";
import {
  createPlaybackSessionEvent,
  createPlaybackSessionFromPlan,
  PlaybackSessionReducerError,
  reducePlaybackSession,
  toPlaybackSessionError,
} from "../PlaybackSessionReducer";

const PLAN_PRIMARY_ID = "00000000-0000-4000-8000-000000000101";
const PLAN_FALLBACK_ID = "00000000-0000-4000-8000-000000000102";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000201";
const FALLBACK_ATTEMPT_ID = "00000000-0000-4000-8000-000000000202";
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

function makeIdFactory(start = 1) {
  let value = start;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function makeNowFactory() {
  let value = 0;
  return () => new Date(Date.UTC(2026, 5, 4, 10, 0, value++)).toISOString();
}

function makeOptions(start = 1) {
  return {
    idFactory: makeIdFactory(start),
    now: makeNowFactory(),
  };
}

function makeReadyPlan() {
  return makePlaybackPlan({
    state: "ready",
    plan: {
      mode: "bridge",
      selectedCandidate: makePlannedMediaCandidate({
        id: PLAN_PRIMARY_ID,
        kind: "torrent",
        stream: {
          infoHash: "secret-torrent-hash",
          title: "Torrent source",
        },
        requiresBridge: true,
      }),
      fallbackCandidates: [
        makePlannedMediaCandidate({
          id: PLAN_FALLBACK_ID,
          kind: "direct",
          stream: {
            url: "https://cdn.example.test/fallback.mp4",
            title: "Direct fallback",
          },
          rank: 1,
        }),
      ],
    },
  });
}

describe("PlaybackSessionReducer", () => {
  it("creates persistence-safe session snapshots with separate runtime candidates", () => {
    const plan = makeReadyPlan();
    const bundle = createPlaybackSessionFromPlan(
      {
        plan,
        content: { type: "movie", id: "tt123" },
        deviceProfile,
        bridge: { status: "available" },
      },
      makeOptions(),
    );

    expect(playbackSessionSchema.safeParse(bundle.session).success).toBe(true);
    expect(bundle.session.status).toBe("selecting_candidate");
    expect(bundle.session.candidates).toHaveLength(2);
    expect(
      bundle.session.candidates.map((candidate) => candidate.id),
    ).not.toEqual([PLAN_PRIMARY_ID, PLAN_FALLBACK_ID]);
    expect(bundle.session.selectedCandidateId).toBe(
      bundle.session.candidates[0].id,
    );
    expect(bundle.session.eventLog.map((event) => event.type)).toEqual([
      "session_created",
      "candidate_selected",
    ]);

    const persistedJson = JSON.stringify(bundle.session);
    expect(persistedJson).not.toContain("secret-torrent-hash");
    expect(persistedJson).not.toContain("cdn.example.test");

    expect(
      bundle.runtime.candidates[bundle.session.candidates[0].id].stream
        .infoHash,
    ).toBe("secret-torrent-hash");
    expect(
      bundle.runtime.candidates[bundle.session.candidates[1].id].stream.url,
    ).toBe("https://cdn.example.test/fallback.mp4");
  });

  it("creates a session for a non-ready plan without inventing candidates", () => {
    const bundle = createPlaybackSessionFromPlan(
      {
        plan: makePlaybackPlan({ state: "notFound" }),
        content: { type: "movie", id: "tt-missing" },
        deviceProfile,
      },
      makeOptions(),
    );

    expect(bundle.session).toMatchObject({
      status: "created",
      candidates: [],
      attempts: [],
    });
    expect(bundle.session.selectedCandidateId).toBeUndefined();
    expect(bundle.runtime.candidates).toEqual({});
    expect(bundle.runtime.plan.state).toBe("notFound");
  });

  it("reduces attempts, gateway progress, and fallback transitions", () => {
    const options = makeOptions(100);
    const { session: initialSession } = createPlaybackSessionFromPlan(
      {
        plan: makeReadyPlan(),
        content: { type: "movie", id: "tt123" },
        deviceProfile,
      },
      options,
    );
    const primaryId = initialSession.candidates[0].id;
    const fallbackId = initialSession.candidates[1].id;

    const events: PlaybackSessionEvent[] = [
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "attempt_started",
          attemptId: ATTEMPT_ID,
          candidateId: primaryId,
        },
        options,
      ),
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "gateway_job_attached",
          gatewayJobId: GATEWAY_JOB_ID,
          candidateId: primaryId,
        },
        options,
      ),
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "gateway_progress",
          gatewayJobId: GATEWAY_JOB_ID,
          phase: "finding_peers",
          progress: 0.25,
          peerCount: 2,
        },
        options,
      ),
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "attempt_failed",
          attemptId: ATTEMPT_ID,
          candidateId: primaryId,
          error: {
            code: "NO_PEERS",
            message: "No peers found.",
            retryable: true,
            shouldFallback: true,
          },
        },
        options,
      ),
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "fallback_started",
          fromCandidateId: primaryId,
          toCandidateId: fallbackId,
          reason: "No peers found.",
        },
        options,
      ),
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "attempt_started",
          attemptId: FALLBACK_ATTEMPT_ID,
          candidateId: fallbackId,
        },
        options,
      ),
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "attempt_ready",
          attemptId: FALLBACK_ATTEMPT_ID,
          candidateId: fallbackId,
        },
        options,
      ),
    ];

    const session = events.reduce(reducePlaybackSession, initialSession);

    expect(session.status).toBe("ready");
    expect(session.selectedCandidateId).toBe(fallbackId);
    expect(session.gatewayJobId).toBeUndefined();
    expect(session.attempts).toMatchObject([
      { id: ATTEMPT_ID, status: "failed", error: { code: "NO_PEERS" } },
      { id: FALLBACK_ATTEMPT_ID, status: "ready" },
    ]);
    expect(playbackSessionSchema.safeParse(session).success).toBe(true);
  });

  it("allows a ready attempt to fail before the player produces a frame", () => {
    const options = makeOptions(150);
    const { session: initialSession } = createPlaybackSessionFromPlan(
      {
        plan: makeReadyPlan(),
        content: { type: "movie", id: "tt123" },
        deviceProfile,
      },
      options,
    );
    const candidateId = initialSession.candidates[0].id;
    const attempting = reducePlaybackSession(
      initialSession,
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "attempt_started",
          attemptId: ATTEMPT_ID,
          candidateId,
        },
        options,
      ),
    );
    const ready = reducePlaybackSession(
      attempting,
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "attempt_ready",
          attemptId: ATTEMPT_ID,
          candidateId,
        },
        options,
      ),
    );

    const failed = reducePlaybackSession(
      ready,
      createPlaybackSessionEvent(
        initialSession.id,
        {
          type: "attempt_failed",
          attemptId: ATTEMPT_ID,
          candidateId,
          error: {
            code: "PLAYBACK_TIMEOUT",
            message: "Playback did not start in time.",
            retryable: true,
            shouldFallback: true,
          },
        },
        options,
      ),
    );

    expect(failed.attempts[0]).toMatchObject({
      status: "failed",
      error: { code: "PLAYBACK_TIMEOUT" },
    });
  });

  it("treats identical event replay as idempotent and rejects event rewrites", () => {
    const options = makeOptions(200);
    const { session } = createPlaybackSessionFromPlan(
      {
        plan: makeReadyPlan(),
        content: { type: "movie", id: "tt123" },
        deviceProfile,
      },
      options,
    );
    const event = createPlaybackSessionEvent(
      session.id,
      {
        type: "attempt_started",
        attemptId: ATTEMPT_ID,
        candidateId: session.candidates[0].id,
      },
      options,
    ) as Extract<PlaybackSessionEvent, { type: "attempt_started" }>;

    const once = reducePlaybackSession(session, event);
    expect(reducePlaybackSession(once, event)).toEqual(once);

    expect(() =>
      reducePlaybackSession(once, {
        ...event,
        candidateId: session.candidates[1].id,
      }),
    ).toThrow("Playback session event id was reused with different data.");
  });

  it("rejects invalid candidate attempts and events after terminal state", () => {
    const options = makeOptions(300);
    const { session } = createPlaybackSessionFromPlan(
      {
        plan: makeReadyPlan(),
        content: { type: "movie", id: "tt123" },
        deviceProfile,
      },
      options,
    );

    expect(() =>
      reducePlaybackSession(
        session,
        createPlaybackSessionEvent(
          session.id,
          {
            type: "attempt_started",
            attemptId: ATTEMPT_ID,
            candidateId: session.candidates[1].id,
          },
          options,
        ),
      ),
    ).toThrow("An attempt can only start for the selected candidate.");

    const failed = reducePlaybackSession(
      session,
      createPlaybackSessionEvent(
        session.id,
        {
          type: "session_failed",
          error: {
            code: "NO_PEERS",
            message: "No peers found.",
            retryable: true,
            shouldFallback: false,
          },
        },
        options,
      ),
    );

    expect(() =>
      reducePlaybackSession(
        failed,
        createPlaybackSessionEvent(
          session.id,
          {
            type: "session_completed",
          },
          options,
        ),
      ),
    ).toThrow(PlaybackSessionReducerError);
  });

  it("strips runtime-only debug details from persisted errors", () => {
    expect(
      toPlaybackSessionError({
        code: "SOURCE_UNAVAILABLE",
        message: "Source did not return a playback URL.",
        retryable: true,
        shouldFallback: true,
        debugMessage: "https://signed.example.test/private-token",
      }),
    ).toEqual({
      code: "SOURCE_UNAVAILABLE",
      message: "Source did not return a playback URL.",
      retryable: true,
      shouldFallback: true,
    });

    expect(
      toPlaybackSessionError({
        code: "SOURCE_UNAVAILABLE",
        message:
          "Source https://signed.example.test/private-token did not respond.",
        retryable: true,
        shouldFallback: true,
      }).message,
    ).toBe("Source [redacted] did not respond.");
  });
});
