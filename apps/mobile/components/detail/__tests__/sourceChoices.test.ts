import type { PlaybackPlan, PlannedMediaCandidate } from "@streamer/shared";
import { createSourceChoices } from "../sourceChoices";

function candidate(
  id: string,
  overrides: Partial<PlannedMediaCandidate> = {},
): PlannedMediaCandidate {
  return {
    id,
    stream: { url: `https://cdn.example.test/${id}.mp4` },
    kind: "direct",
    quality: "1080p",
    audioLanguage: "en",
    riskFlags: [],
    rank: 0,
    score: 100,
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
    actionEligibility: { action: "play", eligible: true },
    decisionReasons: [],
    ...overrides,
  };
}

function plan(candidates: PlannedMediaCandidate[]): PlaybackPlan {
  return {
    version: 2,
    action: "play",
    state: "ready",
    selectedCandidate: candidates[0],
    fallbackCandidates: candidates.slice(1),
    orderedCandidates: candidates,
    rejectedCandidates: [],
    decisionReasons: [],
    actionEligibility: { action: "play", eligible: true },
    timeoutBudget: {
      totalMs: 60_000,
      directProbeMs: 5_000,
      hlsProbeMs: 5_000,
      bridgeConnectMs: 5_000,
      torrentMetadataMs: 10_000,
      peerDiscoveryMs: 20_000,
      remuxReadyMs: 15_000,
    },
    requiresBridge: false,
    requiresRemux: false,
  };
}

describe("createSourceChoices", () => {
  it("exposes only consumer metadata and compatibility states", () => {
    const choices = createSourceChoices(
      plan([
        candidate("ready", { quality: "2160p", sizeBytes: 2_000_000 }),
        candidate("service", { requiresBridge: true }),
        candidate("conversion", { requiresRemux: true }),
      ]),
    );

    expect(choices).toEqual([
      expect.objectContaining({
        candidateId: "ready",
        quality: { kind: "label", value: "4K" },
        language: { kind: "code", code: "en" },
        compatibility: "ready",
      }),
      expect.objectContaining({
        candidateId: "service",
        compatibility: "local-service",
      }),
      expect.objectContaining({
        candidateId: "conversion",
        compatibility: "conversion",
      }),
    ]);
    expect(JSON.stringify(choices)).not.toMatch(/score|codec|rank|seeders/i);
  });

  it("does not surface rejected or ineligible candidates in the consumer list", () => {
    const blocked = candidate("blocked", {
      actionEligibility: {
        action: "play",
        eligible: false,
        reason: "device_incompatible",
      },
    });

    expect(createSourceChoices(plan([blocked]))).toEqual([]);
  });
});
