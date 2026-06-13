import type { PlaybackPlan, PlannedMediaCandidate } from "@streamer/shared";
import { createDebugBundle, serializeDebugBundle } from "../debugBundle";

const rawUrl = "https://cdn.example.test/movie.mp4?token=secret-token";
const rawGatewayUrl =
  "http://127.0.0.1:11470/api/gateway/jobs/job-1/stream?expires=123&signature=secret-signature";
const rawMagnet =
  "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12";
const rawInfoHash = "abcdef1234567890abcdef1234567890abcdef12";
const rawPath = "file:///Users/julian/private/movie.mp4";

function createCandidate(
  overrides: Partial<PlannedMediaCandidate> = {},
): PlannedMediaCandidate {
  return {
    id: "candidate-1",
    rank: 1,
    score: 98,
    kind: "torrent",
    stream: {
      title: `Best source ${rawUrl} ${rawMagnet}`,
      url: rawUrl,
      externalUrl: "https://external.example.test/watch?key=secret",
      infoHash: rawInfoHash,
      type: "movie",
      id: "tt123",
    },
    quality: "1080p",
    container: "mkv",
    videoCodec: "h265",
    audioCodec: "eac3",
    hdr: "hdr10",
    seeders: 42,
    sizeBytes: 5_000_000_000,
    riskFlags: ["torrent"],
    requiresBridge: true,
    requiresRemux: true,
    deviceCompatibility: {
      compatible: true,
      containerSupported: false,
      videoCodecSupported: true,
      audioCodecSupported: true,
      qualityWithinProfile: true,
      sourceReachable: true,
    },
    actionEligibility: {
      action: "play",
      eligible: true,
    },
    decisionReasons: ["bridge_source_selected", "remux_selected"],
    ...overrides,
  };
}

function createPlan(): PlaybackPlan {
  const selectedCandidate = createCandidate();

  return {
    version: 2,
    action: "play",
    state: "ready",
    selectedCandidate,
    fallbackCandidates: [
      createCandidate({
        id: "candidate-2",
        rank: 2,
        stream: {
          title: "Fallback direct",
          url: "https://fallback.example.test/fallback.mp4?access_token=secret",
          type: "movie",
          id: "tt123",
        },
        kind: "direct",
        requiresBridge: false,
        requiresRemux: false,
      }),
    ],
    orderedCandidates: [selectedCandidate],
    rejectedCandidates: [
      {
        candidateId: "candidate-rejected",
        title: `Rejected ${rawUrl}`,
        reason: `Bridge unavailable for ${rawGatewayUrl}`,
        reasonCode: "bridge_unavailable",
        requiresBridge: true,
        requiresRemux: false,
        deviceCompatibility: selectedCandidate.deviceCompatibility,
        actionEligibility: {
          action: "play",
          eligible: false,
          reason: "bridge_unavailable",
        },
      },
    ],
    decisionReasons: [
      {
        code: "bridge_source_selected",
        message: `Selected through ${rawGatewayUrl}`,
        candidateId: "candidate-1",
      },
    ],
    actionEligibility: {
      action: "play",
      eligible: true,
    },
    timeoutBudget: {
      totalMs: 30_000,
      directProbeMs: 2_000,
      hlsProbeMs: 2_000,
      bridgeConnectMs: 2_000,
      torrentMetadataMs: 8_000,
      peerDiscoveryMs: 10_000,
      remuxReadyMs: 6_000,
    },
    requiresBridge: true,
    requiresRemux: true,
    deviceCompatibility: selectedCandidate.deviceCompatibility,
    plan: {
      mode: "remux",
      selectedCandidate,
      fallbackCandidates: [],
      playbackUrl: rawGatewayUrl,
    },
    userMessage: `Try ${rawUrl}`,
    debug: {
      rejectedCandidates: [],
    },
  };
}

describe("debugBundle", () => {
  it("serializes planner state without raw streams, URLs, magnets, hashes, tokens, or local paths", () => {
    const bundle = createDebugBundle({
      plan: createPlan(),
      context: {
        screen: "detail",
        token: "secret-token",
        localUri: rawPath,
        streamServerUrl: "http://10.0.0.12:11470",
      },
    });

    const json = serializeDebugBundle(bundle);
    const parsed = JSON.parse(json);

    expect(json).not.toContain(rawUrl);
    expect(json).not.toContain(rawGatewayUrl);
    expect(json).not.toContain(rawMagnet);
    expect(json).not.toContain(rawInfoHash);
    expect(json).not.toContain("secret-token");
    expect(json).not.toContain("secret-signature");
    expect(json).not.toContain("/Users/julian");
    expect(json).not.toContain("10.0.0.12:11470");

    expect(json).toContain("[url]");
    expect(json).toContain("[magnet]");
    expect(parsed.planner.orderedCandidates[0].sourceType).toBe("torrent");
    expect(parsed.planner.orderedCandidates[0].stream).toBeUndefined();
    expect(parsed.planner.plan.playbackUrl).toBeUndefined();
    expect(parsed.planner.rejectedCandidates[0].reasonCode).toBe(
      "bridge_unavailable",
    );
  });

  it("includes privacy-safe app, device, session, planner, bridge, and download snapshots", () => {
    const bundle = createDebugBundle({
      plan: createPlan(),
      context: {
        screen: "detail",
      },
    });

    const parsed = JSON.parse(serializeDebugBundle(bundle));

    expect(parsed.app).toMatchObject({
      version: expect.any(String),
      buildChannel: expect.any(String),
      environment: expect.any(String),
      runtime: expect.any(String),
    });
    expect(parsed.device).toMatchObject({
      platform: expect.any(String),
      profile: {
        platform: expect.any(String),
        supports: expect.any(Object),
        maxQuality: expect.any(String),
      },
    });
    expect(parsed.bridge).toEqual(expect.any(Object));
    expect(parsed.session).toBeDefined();
    expect(parsed.planner.orderedCandidates[0]).toMatchObject({
      candidateId: "candidate-1",
      rank: 1,
      sourceType: "torrent",
      actionEligibility: {
        action: "play",
        eligible: true,
      },
    });
    expect(parsed.downloads).toEqual(expect.any(Array));
  });
});
