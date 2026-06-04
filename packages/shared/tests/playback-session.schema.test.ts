import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  playbackErrorCodeSchema,
  playbackSessionEventSchema,
  playbackSessionSchema,
  type PlaybackErrorCode,
  type PlaybackSession,
  type PlaybackSessionEvent,
} from "../src";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000002";
const EVENT_ID = "00000000-0000-4000-8000-000000000003";
const TIMESTAMP = "2026-06-04T10:00:00.000Z";

function makeSession(): PlaybackSession {
  return {
    schemaVersion: 1,
    id: SESSION_ID,
    action: "play",
    status: "created",
    content: {
      type: "movie",
      id: "tt1234567",
    },
    candidates: [
      {
        id: CANDIDATE_ID,
        rank: 0,
        sourceType: "direct",
        quality: "1080p",
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        hdr: "sdr",
        requiresBridge: false,
        requiresRemux: false,
        riskFlags: [],
      },
    ],
    attempts: [],
    selectedCandidateId: CANDIDATE_ID,
    deviceProfile: {
      platform: "ios",
      maxQuality: "1080p",
      network: "remote",
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
    },
    timeoutBudgetMs: 60_000,
    eventLog: [
      {
        id: EVENT_ID,
        sessionId: SESSION_ID,
        at: TIMESTAMP,
        type: "session_created",
        action: "play",
      },
    ],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

describe("playbackSessionSchema", () => {
  it("validates a persistence-safe playback session", () => {
    expect(playbackSessionSchema.parse(makeSession())).toEqual(makeSession());
  });

  it("rejects raw playback URLs at the session and candidate boundaries", () => {
    const sessionWithResolvedUrl = {
      ...makeSession(),
      resolvedUrl: "https://cdn.example.test/movie.mp4",
    };
    const sessionWithCandidateUrl = {
      ...makeSession(),
      candidates: [
        {
          ...makeSession().candidates[0],
          url: "https://cdn.example.test/movie.mp4",
        },
      ],
    };

    expect(
      playbackSessionSchema.safeParse(sessionWithResolvedUrl).success,
    ).toBe(false);
    expect(
      playbackSessionSchema.safeParse(sessionWithCandidateUrl).success,
    ).toBe(false);
  });

  it("requires opaque UUID candidate ids instead of source-derived ids", () => {
    const session = makeSession();
    session.candidates[0].id = "https://cdn.example.test/movie.mp4";
    session.selectedCandidateId = session.candidates[0].id;

    expect(playbackSessionSchema.safeParse(session).success).toBe(false);
  });

  it("rejects broken candidate and event references", () => {
    const session = makeSession();
    session.selectedCandidateId = "00000000-0000-4000-8000-000000000099";
    session.eventLog[0].sessionId = "00000000-0000-4000-8000-000000000098";

    const result = playbackSessionSchema.safeParse(session);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "selectedCandidateId must reference a session candidate.",
          "Event sessionId must match the playback session id.",
        ]),
      );
    }
  });

  it("rejects event references that do not exist in the session", () => {
    const session = makeSession();
    session.eventLog.push({
      id: "00000000-0000-4000-8000-000000000004",
      sessionId: SESSION_ID,
      at: TIMESTAMP,
      type: "attempt_started",
      attemptId: "00000000-0000-4000-8000-000000000005",
      candidateId: "00000000-0000-4000-8000-000000000006",
    });

    const result = playbackSessionSchema.safeParse(session);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Event candidate reference must exist in the session.",
          "Event attempt reference must exist in the session.",
        ]),
      );
    }
  });

  it("requires unique event ids for append-only processing", () => {
    const session = makeSession();
    session.eventLog.push({
      id: EVENT_ID,
      sessionId: SESSION_ID,
      at: TIMESTAMP,
      type: "session_completed",
    });

    const result = playbackSessionSchema.safeParse(session);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Playback session event ids must be unique.",
      );
    }
  });

  it("accepts URL-free download progress and verification events", () => {
    const progressEvent: PlaybackSessionEvent = {
      id: "00000000-0000-4000-8000-000000000004",
      sessionId: SESSION_ID,
      at: TIMESTAMP,
      type: "download_progress",
      progress: 0.5,
      totalBytesWritten: 500,
      totalBytesExpectedToWrite: 1000,
    };
    const verifiedEvent: PlaybackSessionEvent = {
      id: "00000000-0000-4000-8000-000000000005",
      sessionId: SESSION_ID,
      at: TIMESTAMP,
      type: "download_verified",
    };

    expect(playbackSessionEventSchema.parse(progressEvent)).toEqual(
      progressEvent,
    );
    expect(playbackSessionEventSchema.parse(verifiedEvent)).toEqual(
      verifiedEvent,
    );
  });

  it("keeps schema inference aligned with the exported session types", () => {
    expectTypeOf<
      z.infer<typeof playbackErrorCodeSchema>
    >().toEqualTypeOf<PlaybackErrorCode>();
    expectTypeOf<
      z.infer<typeof playbackSessionSchema>
    >().toEqualTypeOf<PlaybackSession>();
    expectTypeOf<
      z.infer<typeof playbackSessionEventSchema>
    >().toEqualTypeOf<PlaybackSessionEvent>();
  });
});
