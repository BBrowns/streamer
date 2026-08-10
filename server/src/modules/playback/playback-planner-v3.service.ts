import type {
  MediaCandidate,
  PlaybackAction,
  PlaybackActionEligibilityV3,
  PlaybackDecisionReason,
  PlaybackDecisionReasonCode,
  PlaybackDelivery,
  PlaybackDeviceCompatibility,
  PlaybackExecutionNode,
  PlaybackExecutionTarget,
  PlaybackPlanV3,
  PlaybackPlanV3Request,
  PlaybackRejectReasonV3,
  PlaybackRoute,
  PlaybackRouteCapabilities,
  PlaybackSourceDiscovery,
  PlaybackTimeoutBudget,
  PlannedMediaCandidateV3,
  RejectedCandidateV3,
  Stream,
} from "@streamer/shared";
import { aggregatorService } from "../aggregator/aggregator.service.js";
import {
  candidateNeedsRemux,
  candidateNeedsTranscode,
  candidateSortKey,
  getCastSourceReachability,
  getDeviceCompatibility,
  normalizeStream,
  qualityAllowedByPreferences,
  scoreCandidate,
} from "./source-normalizer.js";

const SUPPORTED_BRIDGE_PROTOCOL_VERSION = 1;

const BRIDGE_EXECUTION_TARGETS = new Set<PlaybackExecutionTarget>([
  "local-sidecar",
  "paired-bridge",
  "remote-bridge",
]);

const TARGET_PREFERENCE: Record<
  PlaybackAction,
  readonly PlaybackExecutionTarget[]
> = {
  play: [
    "on-device",
    "local-sidecar",
    "paired-bridge",
    "debrid",
    "remote-bridge",
  ],
  download: [
    "on-device",
    "debrid",
    "local-sidecar",
    "paired-bridge",
    "remote-bridge",
  ],
  cast: [
    "local-sidecar",
    "paired-bridge",
    "remote-bridge",
    "on-device",
    "debrid",
  ],
};

const TIMEOUT_BUDGETS: Record<PlaybackAction, PlaybackTimeoutBudget> = {
  play: {
    totalMs: 120_000,
    directProbeMs: 8_000,
    hlsProbeMs: 12_000,
    bridgeConnectMs: 5_000,
    torrentMetadataMs: 30_000,
    peerDiscoveryMs: 60_000,
    remuxReadyMs: 60_000,
  },
  download: {
    totalMs: 180_000,
    directProbeMs: 10_000,
    hlsProbeMs: 12_000,
    bridgeConnectMs: 5_000,
    torrentMetadataMs: 45_000,
    peerDiscoveryMs: 90_000,
    remuxReadyMs: 90_000,
  },
  cast: {
    totalMs: 150_000,
    directProbeMs: 10_000,
    hlsProbeMs: 15_000,
    bridgeConnectMs: 5_000,
    torrentMetadataMs: 30_000,
    peerDiscoveryMs: 60_000,
    remuxReadyMs: 75_000,
  },
};

const DECISION_MESSAGES: Record<PlaybackDecisionReasonCode, string> = {
  selected_highest_score:
    "Selected the highest ranked source eligible for this action.",
  direct_source_preferred:
    "Direct file sources are preferred for fast and reliable startup.",
  hls_source_preferred:
    "HLS is preferred when adaptive streaming is suitable for the target.",
  bridge_source_selected:
    "The selected torrent source can be prepared by its execution target.",
  remux_selected:
    "The selected source can be remuxed into a compatible container.",
  offline_eligible_source_selected:
    "The selected source is eligible for verified offline download.",
  cast_compatible_source_selected:
    "The selected source is compatible with the cast target profile.",
  device_compatible:
    "The selected source is compatible with the target device profile.",
  quality_within_profile:
    "The selected source quality is within the device preference.",
  quality_above_profile:
    "The selected source quality is above the device preference.",
  fallbacks_available:
    "Additional eligible sources are available for automatic fallback.",
  bridge_required:
    "The selected route is owned by a negotiated bridge execution target.",
  no_action_eligible_candidates:
    "No available source has a safe execution route for this action.",
};

interface RouteSelection {
  route?: PlaybackRoute;
  rejectionReason?: Extract<
    PlaybackRejectReasonV3,
    | "execution_target_unavailable"
    | "source_kind_unsupported"
    | "delivery_unsupported"
    | "action_capability_unsupported"
    | "protocol_unsupported"
  >;
}

interface CandidateEvaluationV3 {
  candidate: MediaCandidate;
  score: number;
  requiresBridge: boolean;
  requiresRemux: boolean;
  deviceCompatibility: PlaybackDeviceCompatibility;
  actionEligibility: PlaybackActionEligibilityV3;
  decisionReasons: PlaybackDecisionReasonCode[];
  route?: PlaybackRoute;
  rejectionReason?: PlaybackRejectReasonV3;
}

function episodeAwareId(request: PlaybackPlanV3Request): string {
  if (
    request.type === "series" &&
    typeof request.season === "number" &&
    typeof request.episode === "number"
  ) {
    return `${request.id}:${request.season}:${request.episode}`;
  }
  return request.id;
}

function withFileSelectionHints(
  stream: Stream,
  request: PlaybackPlanV3Request,
): Stream {
  if (
    request.type !== "series" ||
    typeof request.season !== "number" ||
    typeof request.episode !== "number"
  ) {
    return stream;
  }

  return {
    ...stream,
    fileSelectionHints: {
      ...stream.fileSelectionHints,
      season: request.season,
      episode: request.episode,
    },
  };
}

function dedupeCandidates(candidates: MediaCandidate[]): MediaCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidateSortKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function desiredDelivery(
  candidate: MediaCandidate,
  action: PlaybackAction,
  requiresRemux: boolean,
  platform: PlaybackPlanV3Request["deviceProfile"]["platform"],
): PlaybackDelivery | undefined {
  if (candidate.kind === "direct") {
    // DownloadService still has to copy and verify a remote direct response.
    // `offline-file` is reserved for a source that already exists locally.
    return "direct";
  }
  if (candidate.kind === "hls") {
    return action === "download" && platform !== "electron" ? undefined : "hls";
  }
  if (candidate.kind === "torrent") {
    // The bridge materializes a stable seekable cache; the client then owns
    // copying and verifying the final offline file. `offline-file` is reserved
    // for media that is already local to the on-device executor.
    if (action === "download") return "seekable-cache";
    if (action === "cast") return "seekable-cache";
    return requiresRemux ? "progressive-fmp4" : "range-http";
  }
  return undefined;
}

function capabilitiesSupportAction(
  capabilities: PlaybackRouteCapabilities,
  action: PlaybackAction,
): boolean {
  if (action === "cast") return capabilities.cast;
  if (action === "download") return capabilities.offline;
  return capabilities.seek !== "unavailable";
}

function protocolSupported(node: PlaybackExecutionNode): boolean {
  if (!BRIDGE_EXECUTION_TARGETS.has(node.executionTarget)) return true;
  return node.bridgeProtocolVersion === SUPPORTED_BRIDGE_PROTOCOL_VERSION;
}

function selectRoute(
  candidate: MediaCandidate,
  delivery: PlaybackDelivery,
  request: PlaybackPlanV3Request,
): RouteSelection {
  if (
    candidate.kind !== "direct" &&
    candidate.kind !== "hls" &&
    candidate.kind !== "torrent"
  ) {
    return { rejectionReason: "source_kind_unsupported" };
  }
  const sourceKind = candidate.kind;

  const availableNodes = request.executionNodes.filter(
    (node) => node.availability === "available",
  );
  if (availableNodes.length === 0) {
    return { rejectionReason: "execution_target_unavailable" };
  }

  const sourceNodes = availableNodes.filter((node) =>
    node.acceptedSourceKinds.includes(sourceKind),
  );
  if (sourceNodes.length === 0) {
    return { rejectionReason: "source_kind_unsupported" };
  }

  const deliveryNodes = sourceNodes
    .map((node) => ({
      node,
      delivery: node.deliveries.find(
        (capability) => capability.delivery === delivery,
      ),
    }))
    .filter(
      (
        entry,
      ): entry is {
        node: PlaybackExecutionNode;
        delivery: PlaybackExecutionNode["deliveries"][number];
      } => Boolean(entry.delivery),
    );
  if (deliveryNodes.length === 0) {
    return { rejectionReason: "delivery_unsupported" };
  }

  const negotiatedNodes = deliveryNodes.filter(({ node }) =>
    protocolSupported(node),
  );
  if (negotiatedNodes.length === 0) {
    return { rejectionReason: "protocol_unsupported" };
  }

  const actionNodes = negotiatedNodes.filter(({ delivery: capability }) =>
    capabilitiesSupportAction(capability.capabilities, request.action),
  );
  if (actionNodes.length === 0) {
    return { rejectionReason: "action_capability_unsupported" };
  }

  const preference = TARGET_PREFERENCE[request.action];
  actionNodes.sort(
    (first, second) =>
      preference.indexOf(first.node.executionTarget) -
      preference.indexOf(second.node.executionTarget),
  );
  const selected = actionNodes[0];

  return {
    route: {
      candidateId: candidate.id,
      executionTarget: selected.node.executionTarget,
      delivery,
      capabilities: selected.delivery.capabilities,
    },
  };
}

function remuxCanProvideCompatibility(
  request: PlaybackPlanV3Request,
  requiresRemux: boolean,
  compatibility: PlaybackDeviceCompatibility,
): boolean {
  return (
    requiresRemux &&
    request.deviceProfile.supports.mp4 &&
    request.deviceProfile.supports.aac &&
    compatibility.videoCodecSupported &&
    compatibility.sourceReachable
  );
}

function actionEligibility(
  action: PlaybackAction,
  eligible: boolean,
  reason?: PlaybackRejectReasonV3,
): PlaybackActionEligibilityV3 {
  return {
    action,
    eligible,
    ...(reason ? { reason } : {}),
  };
}

function candidateDecisionReasons(
  candidate: MediaCandidate,
  request: PlaybackPlanV3Request,
  route: PlaybackRoute,
  requiresRemux: boolean,
  compatibility: PlaybackDeviceCompatibility,
): PlaybackDecisionReasonCode[] {
  const reasons: PlaybackDecisionReasonCode[] = [];

  if (candidate.kind === "direct") reasons.push("direct_source_preferred");
  if (candidate.kind === "hls") reasons.push("hls_source_preferred");
  if (
    candidate.kind === "torrent" &&
    BRIDGE_EXECUTION_TARGETS.has(route.executionTarget)
  ) {
    reasons.push("bridge_source_selected");
  }
  if (requiresRemux) reasons.push("remux_selected");
  if (compatibility.compatible) reasons.push("device_compatible");
  reasons.push(
    compatibility.qualityWithinProfile
      ? "quality_within_profile"
      : "quality_above_profile",
  );
  if (request.action === "download") {
    reasons.push("offline_eligible_source_selected");
  }
  if (request.action === "cast") {
    reasons.push("cast_compatible_source_selected");
  }

  return reasons;
}

function evaluateCandidate(
  candidate: MediaCandidate,
  request: PlaybackPlanV3Request,
): CandidateEvaluationV3 {
  const requiresRemux =
    candidate.kind === "torrent" &&
    candidateNeedsRemux(candidate, request.deviceProfile);
  const delivery = desiredDelivery(
    candidate,
    request.action,
    requiresRemux,
    request.deviceProfile.platform,
  );
  const routeSelection = delivery
    ? selectRoute(candidate, delivery, request)
    : undefined;
  const sourceReachable =
    request.action === "cast" &&
    (candidate.kind === "direct" || candidate.kind === "hls")
      ? getCastSourceReachability(candidate) === "reachable"
      : true;
  const deviceCompatibility = getDeviceCompatibility(
    candidate,
    request.deviceProfile,
    sourceReachable,
  );
  const remuxProvidesCompatibility = remuxCanProvideCompatibility(
    request,
    requiresRemux,
    deviceCompatibility,
  );

  if (remuxProvidesCompatibility) {
    deviceCompatibility.containerSupported = true;
    deviceCompatibility.audioCodecSupported = true;
    deviceCompatibility.compatible = true;
  }

  let rejectionReason: PlaybackRejectReasonV3 | undefined;
  if (candidate.kind === "unknown") {
    rejectionReason = "source_missing_url";
  } else if (candidate.kind === "external") {
    rejectionReason = "unknown_stream_type";
  } else if (!qualityAllowedByPreferences(candidate, request.preferences)) {
    rejectionReason = "quality_not_allowed";
  } else if (
    candidate.kind === "hls" &&
    request.action === "download" &&
    request.deviceProfile.platform !== "electron"
  ) {
    rejectionReason = "hls_offline_unsupported";
  } else if (!sourceReachable && request.action === "cast") {
    rejectionReason = "localhost_not_castable";
  } else if (
    candidateNeedsTranscode(candidate, request.deviceProfile) &&
    !remuxProvidesCompatibility
  ) {
    rejectionReason =
      request.action === "cast"
        ? "cast_device_incompatible"
        : "unsupported_codec";
  } else if (!deviceCompatibility.containerSupported && !requiresRemux) {
    rejectionReason =
      request.action === "cast"
        ? "cast_device_incompatible"
        : "unsupported_container";
  } else if (!routeSelection?.route) {
    rejectionReason = routeSelection?.rejectionReason || "delivery_unsupported";
  } else if (!deviceCompatibility.compatible) {
    rejectionReason = "device_incompatible";
  }

  const route = rejectionReason ? undefined : routeSelection?.route;
  const requiresBridge = route
    ? BRIDGE_EXECUTION_TARGETS.has(route.executionTarget)
    : candidate.kind === "torrent" &&
      request.executionNodes.some((node) =>
        BRIDGE_EXECUTION_TARGETS.has(node.executionTarget),
      );

  return {
    candidate,
    score: scoreCandidate(
      candidate,
      request.action,
      request.deviceProfile,
      Boolean(route),
      request.preferences,
    ),
    requiresBridge,
    requiresRemux,
    deviceCompatibility,
    actionEligibility: actionEligibility(
      request.action,
      !rejectionReason,
      rejectionReason,
    ),
    decisionReasons:
      route && !rejectionReason
        ? candidateDecisionReasons(
            candidate,
            request,
            route,
            requiresRemux,
            deviceCompatibility,
          )
        : [],
    route,
    rejectionReason,
  };
}

function sortEvaluations(
  first: CandidateEvaluationV3,
  second: CandidateEvaluationV3,
): number {
  const scoreDifference = second.score - first.score;
  if (scoreDifference !== 0) return scoreDifference;
  return candidateSortKey(first.candidate).localeCompare(
    candidateSortKey(second.candidate),
  );
}

function withRouteHints(
  candidate: MediaCandidate,
  route: PlaybackRoute,
  requiresRemux: boolean,
): MediaCandidate {
  if (
    !requiresRemux &&
    route.delivery !== "progressive-fmp4" &&
    route.delivery !== "seekable-cache"
  ) {
    return candidate;
  }

  return {
    ...candidate,
    stream: {
      ...candidate.stream,
      behaviorHints: {
        ...candidate.stream.behaviorHints,
        ...(requiresRemux ? { remuxToMp4: true } : {}),
        ...(route.delivery === "progressive-fmp4" ||
        route.delivery === "seekable-cache"
          ? { remuxStrategy: route.delivery }
          : {}),
      },
    },
  };
}

function toPlannedCandidate(
  evaluation: CandidateEvaluationV3,
  rank: number,
): PlannedMediaCandidateV3 {
  if (!evaluation.route) {
    throw new Error("Cannot materialize a playback candidate without a route.");
  }

  return {
    ...withRouteHints(
      evaluation.candidate,
      evaluation.route,
      evaluation.requiresRemux,
    ),
    rank,
    score: evaluation.score,
    requiresBridge: evaluation.requiresBridge,
    requiresRemux: evaluation.requiresRemux,
    deviceCompatibility: evaluation.deviceCompatibility,
    actionEligibility: evaluation.actionEligibility,
    decisionReasons: evaluation.decisionReasons,
    route: evaluation.route,
  };
}

function rejectionMessage(reason: PlaybackRejectReasonV3): string {
  switch (reason) {
    case "no_sources":
      return "No sources are available for this title yet.";
    case "unsupported_codec":
      return "Source codec is not supported by this device profile.";
    case "unsupported_container":
      return "Source container is not supported by this device profile.";
    case "hls_offline_unsupported":
      return "HLS sources are streaming-only in offline v1.";
    case "cast_device_incompatible":
      return "Source is not compatible with the cast target profile.";
    case "localhost_not_castable":
      return "Cast devices cannot access localhost-only media.";
    case "source_missing_url":
      return "Source does not expose a playable URL or torrent identifier.";
    case "unknown_stream_type":
      return "Source type is not playable inside the app.";
    case "quality_not_allowed":
      return "Source quality is outside the selected playback qualities.";
    case "execution_target_unavailable":
      return "No trusted execution target is currently available.";
    case "source_kind_unsupported":
      return "Available execution targets do not accept this source kind.";
    case "delivery_unsupported":
      return "Available execution targets do not support the required delivery.";
    case "action_capability_unsupported":
      return "The execution route cannot perform the requested action.";
    case "protocol_unsupported":
      return "The bridge protocol version is not supported.";
    case "bridge_unavailable":
    case "torrent_no_bridge":
      return "A compatible bridge execution target is required.";
    case "device_incompatible":
      return "Source is not compatible with this device profile.";
  }
}

function toRejectedCandidate(
  evaluation: CandidateEvaluationV3,
): RejectedCandidateV3 {
  const reasonCode = evaluation.rejectionReason || "device_incompatible";
  return {
    candidateId: evaluation.candidate.id,
    title:
      evaluation.candidate.stream.title ||
      evaluation.candidate.stream.name ||
      "Untitled source",
    reason: rejectionMessage(reasonCode),
    reasonCode,
    requiresBridge: evaluation.requiresBridge,
    requiresRemux: evaluation.requiresRemux,
    deviceCompatibility: evaluation.deviceCompatibility,
    actionEligibility: evaluation.actionEligibility,
  };
}

function decisionReason(
  code: PlaybackDecisionReasonCode,
  candidateId?: string,
): PlaybackDecisionReason {
  return {
    code,
    message: DECISION_MESSAGES[code],
    ...(candidateId ? { candidateId } : {}),
  };
}

function selectedDecisionReasons(
  selected: PlannedMediaCandidateV3,
  fallbackCount: number,
): PlaybackDecisionReason[] {
  const reasons = [
    decisionReason("selected_highest_score", selected.id),
    ...selected.decisionReasons.map((code) =>
      decisionReason(code, selected.id),
    ),
  ];
  if (selected.requiresBridge) {
    reasons.push(decisionReason("bridge_required", selected.id));
  }
  if (fallbackCount > 0) {
    reasons.push(decisionReason("fallbacks_available"));
  }
  return reasons;
}

function stateForRejectedPlan(
  evaluations: CandidateEvaluationV3[],
): PlaybackPlanV3["state"] {
  const reasons = new Set(
    evaluations.map((evaluation) => evaluation.rejectionReason).filter(Boolean),
  );
  const bridgeRouteFailure = evaluations.some(
    (evaluation) =>
      evaluation.requiresBridge &&
      (evaluation.rejectionReason === "execution_target_unavailable" ||
        evaluation.rejectionReason === "protocol_unsupported"),
  );
  if (bridgeRouteFailure) return "bridgeUnavailable";

  const needsBridge = evaluations.some(
    (evaluation) =>
      evaluation.candidate.kind === "torrent" &&
      evaluation.rejectionReason === "source_kind_unsupported",
  );
  if (needsBridge) return "needsBridge";
  if (reasons.has("unsupported_codec")) return "needsTranscode";
  return "unsupported";
}

function emptyPlan(
  request: PlaybackPlanV3Request,
  state: PlaybackPlanV3["state"],
  rejectedCandidates: RejectedCandidateV3[],
  evaluations: CandidateEvaluationV3[],
  reason: PlaybackRejectReasonV3,
  userMessage: string,
  sourceDiscovery: PlaybackSourceDiscovery,
): PlaybackPlanV3 {
  const leading = [...evaluations].sort(sortEvaluations)[0];
  return {
    version: 3,
    action: request.action,
    state,
    sourceDiscovery,
    fallbackCandidates: [],
    orderedCandidates: [],
    rejectedCandidates,
    decisionReasons: [decisionReason("no_action_eligible_candidates")],
    actionEligibility: actionEligibility(request.action, false, reason),
    timeoutBudget: { ...TIMEOUT_BUDGETS[request.action] },
    requiresBridge: evaluations.some((evaluation) => evaluation.requiresBridge),
    requiresRemux: evaluations.some((evaluation) => evaluation.requiresRemux),
    deviceCompatibility: leading?.deviceCompatibility,
    userMessage,
    debug: { rejectedCandidates },
  };
}

export class PlaybackPlannerV3Service {
  async createPlanV3(
    userId: string,
    request: PlaybackPlanV3Request,
    requestId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<PlaybackPlanV3> {
    const discovery = await aggregatorService.getStreamDiscovery(
      userId,
      request.type,
      episodeAwareId(request),
      requestId,
      options,
    );
    const candidates = dedupeCandidates(
      discovery.streams.map((stream) =>
        normalizeStream(withFileSelectionHints(stream, request)),
      ),
    );

    if (candidates.length === 0) {
      return emptyPlan(
        request,
        "notFound",
        [],
        [],
        "no_sources",
        "No sources are available for this title yet.",
        {
          status: discovery.status,
          usableCandidateCount: 0,
        },
      );
    }

    const evaluations = candidates.map((candidate) =>
      evaluateCandidate(candidate, request),
    );
    const eligibleEvaluations = evaluations
      .filter(
        (
          evaluation,
        ): evaluation is CandidateEvaluationV3 & { route: PlaybackRoute } =>
          evaluation.actionEligibility.eligible &&
          evaluation.route !== undefined,
      )
      .sort(sortEvaluations);
    const rejectedCandidates = evaluations
      .filter((evaluation) => !evaluation.actionEligibility.eligible)
      .sort(sortEvaluations)
      .map(toRejectedCandidate);
    const orderedCandidates = eligibleEvaluations.map(toPlannedCandidate);
    const selectedCandidate = orderedCandidates[0];
    const sourceDiscovery: PlaybackSourceDiscovery = {
      status: discovery.status,
      usableCandidateCount: orderedCandidates.length,
    };

    if (!selectedCandidate) {
      const leadingReason =
        rejectedCandidates[0]?.reasonCode || "device_incompatible";
      return emptyPlan(
        request,
        stateForRejectedPlan(evaluations),
        rejectedCandidates,
        evaluations,
        leadingReason,
        rejectionMessage(leadingReason),
        sourceDiscovery,
      );
    }

    const fallbackCandidates = orderedCandidates.slice(1, 5);
    return {
      version: 3,
      action: request.action,
      state: "ready",
      sourceDiscovery,
      selectedCandidate,
      fallbackCandidates,
      orderedCandidates,
      rejectedCandidates,
      decisionReasons: selectedDecisionReasons(
        selectedCandidate,
        fallbackCandidates.length,
      ),
      actionEligibility: actionEligibility(request.action, true),
      timeoutBudget: { ...TIMEOUT_BUDGETS[request.action] },
      requiresBridge: selectedCandidate.requiresBridge,
      requiresRemux: selectedCandidate.requiresRemux,
      deviceCompatibility: selectedCandidate.deviceCompatibility,
      userMessage: selectedCandidate.requiresRemux
        ? "Preparing this source for your device."
        : undefined,
      debug: { rejectedCandidates },
    };
  }
}

export const playbackPlannerV3Service = new PlaybackPlannerV3Service();
