import type {
  PlaybackAction,
  PlaybackPlan,
  PlaybackPlanV3,
  PlaybackRouteCapabilities,
  PlaybackTimeoutBudget,
  PlannedMediaCandidate,
  PlannedMediaCandidateV3,
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

const DEFAULT_ROUTE_CAPABILITIES: PlaybackRouteCapabilities = {
  seek: "immediate",
  audioTracks: true,
  embeddedSubtitles: true,
  externalSubtitles: true,
  cast: true,
  offline: true,
  thumbnails: true,
};

export function makePlannedMediaCandidateV3(
  overrides: Partial<PlannedMediaCandidateV3> = {},
): PlannedMediaCandidateV3 {
  const {
    route: routeOverride,
    actionEligibility: actionEligibilityOverride,
    ...candidateOverrides
  } = overrides;
  const id = candidateOverrides.id ?? "00000000-0000-4000-8000-000000000001";
  const action = actionEligibilityOverride?.action || "play";
  const route = routeOverride ?? {
    candidateId: id,
    executionTarget: "on-device",
    delivery: "direct",
    capabilities: { ...DEFAULT_ROUTE_CAPABILITIES },
  };

  return {
    ...makePlannedMediaCandidate({
      ...candidateOverrides,
      id,
    }),
    actionEligibility: {
      action,
      eligible: true,
      ...actionEligibilityOverride,
    },
    route,
  };
}

export function makePlaybackPlanV3(
  overrides: Partial<PlaybackPlanV3> & Pick<PlaybackPlanV3, "state">,
): PlaybackPlanV3 {
  const { state, ...rest } = overrides;
  const action: PlaybackAction = overrides.action || "play";
  const rejectionReason =
    state === "notFound"
      ? "no_sources"
      : state === "needsBridge"
        ? "execution_target_unavailable"
        : state === "bridgeUnavailable"
          ? "execution_target_unavailable"
          : state === "needsTranscode"
            ? "delivery_unsupported"
            : state === "unsupported"
              ? "action_capability_unsupported"
              : undefined;
  const selectedCandidate = overrides.selectedCandidate;
  const fallbackCandidates = overrides.fallbackCandidates || [];
  const orderedCandidates =
    overrides.orderedCandidates ||
    (selectedCandidate ? [selectedCandidate, ...fallbackCandidates] : []);

  return {
    version: 3,
    action,
    state,
    selectedCandidate,
    fallbackCandidates,
    orderedCandidates,
    rejectedCandidates: [],
    decisionReasons: [],
    actionEligibility: {
      action,
      eligible: state === "ready",
      reason: rejectionReason,
    },
    timeoutBudget: { ...DEFAULT_TIMEOUT_BUDGET },
    requiresBridge: selectedCandidate?.requiresBridge || false,
    requiresRemux: selectedCandidate?.requiresRemux || false,
    deviceCompatibility: selectedCandidate?.deviceCompatibility,
    ...rest,
  };
}
