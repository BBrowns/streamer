import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import {
  playbackPlanRequestSchema,
  playbackPlanSchema,
  type PlaybackPlan,
  type PlannedMediaCandidate,
} from "../src";

const SELECTED_ID = "00000000-0000-4000-8000-000000000011";
const FALLBACK_ID = "00000000-0000-4000-8000-000000000012";
const REJECTED_ID = "00000000-0000-4000-8000-000000000013";

function makeCandidate(
  id: string,
  rank: number,
  url: string,
): PlannedMediaCandidate {
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

function makePlan(): PlaybackPlan {
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
    version: 2,
    action: "play",
    state: "ready",
    selectedCandidate,
    fallbackCandidates: [fallbackCandidate],
    orderedCandidates: [selectedCandidate, fallbackCandidate],
    rejectedCandidates: [],
    decisionReasons: [
      {
        code: "selected_highest_score",
        message: "Selected the highest ranked source eligible for this action.",
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
    plan: {
      mode: "direct",
      selectedCandidate,
      fallbackCandidates: [fallbackCandidate],
      playbackUrl: selectedCandidate.stream.url,
    },
    debug: {
      rejectedCandidates: [],
    },
  };
}

describe("playbackPlanSchema", () => {
  it("validates a Planner v2 response", () => {
    expect(playbackPlanSchema.parse(makePlan())).toEqual(makePlan());
  });

  it("accepts the safe partial source-discovery summary", () => {
    const plan = makePlan();
    plan.sourceDiscovery = {
      status: "partial",
      usableCandidateCount: 2,
    };

    expect(playbackPlanSchema.parse(plan).sourceDiscovery).toEqual(
      plan.sourceDiscovery,
    );
    expect(
      playbackPlanSchema.safeParse({
        ...plan,
        sourceDiscovery: { status: "partial", usableCandidateCount: -1 },
      }).success,
    ).toBe(false);
  });

  it("requires opaque candidate ids", () => {
    const plan = makePlan();
    plan.selectedCandidate!.id = "https://cdn.example.test/primary.mp4";
    plan.orderedCandidates[0].id = plan.selectedCandidate!.id;
    plan.plan!.selectedCandidate.id = plan.selectedCandidate!.id;

    expect(playbackPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("rejects drift between ordered candidates and legacy plan fields", () => {
    const plan = makePlan();
    plan.plan!.fallbackCandidates = [];

    const result = playbackPlanSchema.safeParse(plan);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Legacy plan fallbackCandidates must match the top-level fallbackCandidates.",
      );
    }
  });

  it("rejects candidate field drift across canonical planner fields", () => {
    const plan = makePlan();
    plan.selectedCandidate = {
      ...plan.selectedCandidate!,
      score: 42,
    };

    const result = playbackPlanSchema.safeParse(plan);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "selectedCandidate must match the first ordered candidate in a ready plan.",
      );
    }
  });

  it("rejects drift between top-level and debug rejected candidates", () => {
    const plan = makePlan();
    plan.debug!.rejectedCandidates = [
      {
        candidateId: REJECTED_ID,
        title: "Unsupported source",
        reason: "This source uses an unsupported codec.",
        reasonCode: "unsupported_codec",
        requiresBridge: false,
        requiresRemux: false,
        deviceCompatibility: {
          compatible: false,
          containerSupported: true,
          videoCodecSupported: false,
          audioCodecSupported: true,
          qualityWithinProfile: true,
          sourceReachable: true,
        },
        actionEligibility: {
          action: "play",
          eligible: false,
          reason: "unsupported_codec",
        },
      },
    ];

    const result = playbackPlanSchema.safeParse(plan);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Debug rejectedCandidates must match the top-level rejectedCandidates.",
      );
    }
  });

  it("requires an explanation when an action is not eligible", () => {
    const plan = makePlan();
    plan.state = "unsupported";
    plan.selectedCandidate = undefined;
    plan.fallbackCandidates = [];
    plan.orderedCandidates = [];
    plan.plan = undefined;
    plan.actionEligibility = {
      action: "play",
      eligible: false,
    };

    const result = playbackPlanSchema.safeParse(plan);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Ineligible actions must include a rejection reason.",
      );
    }
  });

  it("keeps schema inference aligned with the exported plan type", () => {
    expectTypeOf<
      z.infer<typeof playbackPlanSchema>
    >().toEqualTypeOf<PlaybackPlan>();
  });
});

describe("playbackPlanRequestSchema", () => {
  const request = {
    type: "movie" as const,
    id: "tt123",
    action: "play" as const,
    deviceProfile: {
      platform: "web" as const,
      maxQuality: "2160p" as const,
      network: "local" as const,
      supports: {
        h264: true,
        h265: true,
        av1: true,
        mp4: true,
        mkv: true,
        hls: true,
        dolbyVision: true,
        aac: true,
        ac3: true,
        eac3: true,
      },
    },
  };

  it("accepts an exact playback-quality allowlist", () => {
    expect(
      playbackPlanRequestSchema.parse({
        ...request,
        preferences: { allowedQualities: ["2160p", "1080p"] },
      }).preferences?.allowedQualities,
    ).toEqual(["2160p", "1080p"]);
  });

  it("accepts all selectable qualities without treating SD as selectable", () => {
    expect(
      playbackPlanRequestSchema.parse({
        ...request,
        preferences: {
          allowedQualities: ["2160p", "1080p", "720p", "480p"],
        },
      }).preferences?.allowedQualities,
    ).toEqual(["2160p", "1080p", "720p", "480p"]);

    expect(
      playbackPlanRequestSchema.safeParse({
        ...request,
        preferences: { allowedQualities: ["1080p", "SD"] },
      }).success,
    ).toBe(false);
  });

  it("rejects an empty playback-quality allowlist", () => {
    expect(
      playbackPlanRequestSchema.safeParse({
        ...request,
        preferences: { allowedQualities: [] },
      }).success,
    ).toBe(false);
  });
});
