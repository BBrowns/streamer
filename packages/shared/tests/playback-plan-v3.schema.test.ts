import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  playbackPlanResponseSchema,
  playbackPlanV3RequestSchema,
  playbackPlanV3Schema,
  type PlaybackPlanResponse,
  type PlaybackPlanV3,
  type PlaybackPlanV3Request,
  type PlannedMediaCandidateV3,
} from "../src";

const SELECTED_ID = "00000000-0000-4000-8000-000000000031";
const FALLBACK_ID = "00000000-0000-4000-8000-000000000032";

const routeCapabilities = {
  seek: "immediate" as const,
  audioTracks: true,
  embeddedSubtitles: true,
  externalSubtitles: true,
  cast: false,
  offline: false,
  thumbnails: true,
};

function makeRequest(): PlaybackPlanV3Request {
  return {
    version: 3,
    type: "movie",
    id: "tt123",
    action: "play",
    deviceProfile: {
      platform: "web",
      maxQuality: "1080p",
      network: "local",
      supports: {
        h264: true,
        h265: false,
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
    executionNodes: [
      {
        executionTarget: "on-device",
        availability: "available",
        acceptedSourceKinds: ["direct", "hls"],
        deliveries: [
          {
            delivery: "direct",
            capabilities: routeCapabilities,
          },
          {
            delivery: "hls",
            capabilities: {
              ...routeCapabilities,
              thumbnails: false,
            },
          },
        ],
      },
    ],
  };
}

function makeCandidate(
  id: string,
  rank: number,
  url: string,
): PlannedMediaCandidateV3 {
  return {
    id,
    rank,
    score: 1_000 - rank,
    kind: "direct",
    stream: { url },
    quality: "1080p",
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    hdr: "sdr",
    riskFlags: [],
    requiresBridge: false,
    requiresRemux: false,
    route: {
      candidateId: id,
      executionTarget: "on-device",
      delivery: "direct",
      capabilities: routeCapabilities,
    },
    deviceCompatibility: {
      compatible: true,
      containerSupported: true,
      videoCodecSupported: true,
      audioCodecSupported: true,
      qualityWithinProfile: true,
      sourceReachable: true,
    },
    actionEligibility: {
      action: "play",
      eligible: true,
    },
    decisionReasons: ["direct_source_preferred", "device_compatible"],
  };
}

function makePlan(): PlaybackPlanV3 {
  const selectedCandidate = makeCandidate(
    SELECTED_ID,
    0,
    "https://cdn.example.test/primary.mp4",
  );
  const fallbackCandidate = makeCandidate(
    FALLBACK_ID,
    1,
    "https://cdn.example.test/fallback.mp4",
  );

  return {
    version: 3,
    action: "play",
    state: "ready",
    selectedCandidate,
    fallbackCandidates: [fallbackCandidate],
    orderedCandidates: [selectedCandidate, fallbackCandidate],
    rejectedCandidates: [],
    decisionReasons: [
      {
        code: "selected_highest_score",
        message: "Selected the highest ranked executable source.",
        candidateId: SELECTED_ID,
      },
    ],
    actionEligibility: {
      action: "play",
      eligible: true,
    },
    timeoutBudget: {
      totalMs: 120_000,
      directProbeMs: 8_000,
      hlsProbeMs: 12_000,
      bridgeConnectMs: 5_000,
      torrentMetadataMs: 30_000,
      peerDiscoveryMs: 60_000,
      remuxReadyMs: 60_000,
    },
    requiresBridge: false,
    requiresRemux: false,
    deviceCompatibility: selectedCandidate.deviceCompatibility,
  };
}

describe("playbackPlanV3RequestSchema", () => {
  it("accepts an explicit, URL-free execution-node inventory", () => {
    expect(playbackPlanV3RequestSchema.parse(makeRequest())).toEqual(
      makeRequest(),
    );
  });

  it("rejects duplicate targets, source kinds, and deliveries", () => {
    const request = makeRequest();
    request.executionNodes.push(structuredClone(request.executionNodes[0]));
    request.executionNodes[0].acceptedSourceKinds.push("direct");
    request.executionNodes[0].deliveries.push(
      structuredClone(request.executionNodes[0].deliveries[0]),
    );

    const result = playbackPlanV3RequestSchema.safeParse(request);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "executionNodes must contain unique execution targets.",
          "Execution-node source kinds must be unique.",
          "Execution-node deliveries must be unique.",
        ]),
      );
    }
  });

  it("requires protocol negotiation for bridge-owned execution nodes", () => {
    const request = makeRequest();
    request.executionNodes = [
      {
        executionTarget: "paired-bridge",
        availability: "available",
        acceptedSourceKinds: ["torrent"],
        deliveries: [
          {
            delivery: "range-http",
            capabilities: routeCapabilities,
          },
        ],
      },
    ];

    const result = playbackPlanV3RequestSchema.safeParse(request);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Bridge execution nodes must declare a positive protocol version.",
      );
    }
  });

  it("keeps unavailable execution nodes fail-closed", () => {
    const request = makeRequest();
    request.executionNodes[0].availability = "unavailable";

    const result = playbackPlanV3RequestSchema.safeParse(request);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Unavailable execution nodes cannot accept source kinds.",
          "Unavailable execution nodes cannot advertise deliveries.",
        ]),
      );
    }
  });

  it("rejects runtime URLs and credentials at the execution boundary", () => {
    const requestWithRuntimeData = {
      ...makeRequest(),
      executionNodes: [
        {
          ...makeRequest().executionNodes[0],
          url: "http://127.0.0.1:11470",
          token: "secret",
        },
      ],
    };

    expect(
      playbackPlanV3RequestSchema.safeParse(requestWithRuntimeData).success,
    ).toBe(false);
  });

  it("keeps schema inference aligned with the exported request type", () => {
    expectTypeOf<
      z.infer<typeof playbackPlanV3RequestSchema>
    >().toEqualTypeOf<PlaybackPlanV3Request>();
  });
});

describe("playbackPlanV3Schema", () => {
  it("validates an explicit routed plan", () => {
    expect(playbackPlanV3Schema.parse(makePlan())).toEqual(makePlan());
  });

  it("requires every route to reference its own opaque candidate id", () => {
    const plan = makePlan();
    plan.selectedCandidate!.route.candidateId = FALLBACK_ID;
    plan.orderedCandidates[0].route.candidateId = FALLBACK_ID;

    const result = playbackPlanV3Schema.safeParse(plan);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Playback route candidateId must match its candidate.",
      );
    }
  });

  it("requires legacy bridge mirrors to agree with the authoritative route", () => {
    const plan = makePlan();
    plan.selectedCandidate!.requiresBridge = true;
    plan.orderedCandidates[0].requiresBridge = true;
    plan.requiresBridge = true;

    const result = playbackPlanV3Schema.safeParse(plan);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Candidate requiresBridge must match its execution target.",
      );
    }
  });

  it("does not accept resolved runtime fields inside a route", () => {
    const plan = makePlan() as PlaybackPlanV3 & {
      selectedCandidate: PlannedMediaCandidateV3 & {
        route: PlannedMediaCandidateV3["route"] & {
          uri: string;
        };
      };
    };
    plan.selectedCandidate.route.uri =
      "http://127.0.0.1:11470/api/gateway/jobs/job/stream?token=secret";

    expect(playbackPlanV3Schema.safeParse(plan).success).toBe(false);
  });

  it("accepts both v2 and v3 through the response compatibility schema", () => {
    expect(playbackPlanResponseSchema.parse(makePlan()).version).toBe(3);
  });

  it("keeps response-schema inference aligned with the exported union", () => {
    expectTypeOf<
      z.infer<typeof playbackPlanResponseSchema>
    >().toEqualTypeOf<PlaybackPlanResponse>();
  });
});
