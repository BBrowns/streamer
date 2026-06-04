import type {
  PlaybackAction,
  PlaybackPlan,
  PlaybackTimeoutBudget,
  PlannedMediaCandidate,
} from "@streamer/shared";

const DEFAULT_TIMEOUT_BUDGET: PlaybackTimeoutBudget = {
  totalMs: 120_000,
  directProbeMs: 8_000,
  hlsProbeMs: 12_000,
  bridgeConnectMs: 5_000,
  torrentMetadataMs: 30_000,
  peerDiscoveryMs: 60_000,
  remuxReadyMs: 60_000,
};

export function makePlannedMediaCandidate(
  overrides: Partial<PlannedMediaCandidate> = {},
): PlannedMediaCandidate {
  const action = overrides.actionEligibility?.action || "play";

  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "direct",
    stream: { url: "https://cdn.example.test/movie.mp4" },
    riskFlags: [],
    rank: 0,
    score: 1_000,
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
      action,
      eligible: true,
    },
    decisionReasons: ["device_compatible", "quality_within_profile"],
    ...overrides,
  };
}

export function makePlaybackPlan(
  overrides: Partial<PlaybackPlan> & Pick<PlaybackPlan, "state">,
): PlaybackPlan {
  const { state, ...rest } = overrides;
  const action: PlaybackAction = overrides.action || "play";
  const rejectionReason =
    state === "notFound"
      ? "no_sources"
      : state === "needsBridge"
        ? "torrent_no_bridge"
        : state === "bridgeUnavailable"
          ? "bridge_unavailable"
          : state === "needsTranscode"
            ? "unsupported_codec"
            : state === "unsupported"
              ? "device_incompatible"
              : undefined;
  const selectedCandidate = overrides.plan?.selectedCandidate;
  const fallbackCandidates = overrides.plan?.fallbackCandidates || [];
  const orderedCandidates =
    overrides.orderedCandidates ||
    (selectedCandidate ? [selectedCandidate, ...fallbackCandidates] : []);

  return {
    version: 2,
    action,
    state,
    selectedCandidate,
    fallbackCandidates,
    orderedCandidates,
    rejectedCandidates: [],
    decisionReasons: [],
    actionEligibility: {
      action,
      eligible: overrides.state === "ready",
      reason: rejectionReason,
    },
    timeoutBudget: { ...DEFAULT_TIMEOUT_BUDGET },
    requiresBridge: selectedCandidate?.requiresBridge || false,
    requiresRemux: selectedCandidate?.requiresRemux || false,
    deviceCompatibility: selectedCandidate?.deviceCompatibility,
    ...rest,
  };
}
