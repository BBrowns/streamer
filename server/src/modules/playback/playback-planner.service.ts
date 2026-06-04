import type {
  BridgeHealthHint,
  MediaCandidate,
  PlaybackAction,
  PlaybackActionEligibility,
  PlaybackDecisionReason,
  PlaybackDecisionReasonCode,
  PlaybackDeviceCompatibility,
  PlaybackPlan,
  PlaybackPlanMode,
  PlaybackPlanRequest,
  PlaybackRejectReason,
  PlaybackTimeoutBudget,
  PlannedMediaCandidate,
  RejectedCandidate,
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
  scoreCandidate,
} from "./source-normalizer.js";

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
    "The selected torrent source can be prepared by the configured bridge.",
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
  bridge_required: "A desktop bridge is required for the available sources.",
  no_action_eligible_candidates:
    "No available source is eligible for the requested action.",
};

interface CandidateEvaluation {
  candidate: MediaCandidate;
  score: number;
  requiresBridge: boolean;
  requiresRemux: boolean;
  deviceCompatibility: PlaybackDeviceCompatibility;
  actionEligibility: PlaybackActionEligibility;
  decisionReasons: PlaybackDecisionReasonCode[];
  rejectionReason?: PlaybackRejectReason;
}

function episodeAwareId(request: PlaybackPlanRequest) {
  if (
    request.type === "series" &&
    typeof request.season === "number" &&
    typeof request.episode === "number"
  ) {
    return `${request.id}:${request.season}:${request.episode}`;
  }
  return request.id;
}

function bridgeAvailable(bridge?: BridgeHealthHint) {
  return bridge?.status === "available";
}

function bridgeActionCopy(action: PlaybackAction) {
  if (action === "download") {
    return { unsupportedVerb: "be downloaded", startVerb: "download" };
  }
  if (action === "cast") {
    return { unsupportedVerb: "be cast", startVerb: "cast" };
  }
  return { unsupportedVerb: "play", startVerb: "play" };
}

function bridgeMessage(action: PlaybackAction, bridge?: BridgeHealthHint) {
  const { unsupportedVerb, startVerb } = bridgeActionCopy(action);
  if (bridge?.status === "unsupported") {
    return `Desktop bridge needs repair before torrent sources can ${unsupportedVerb} on this device.`;
  }
  if (bridge?.status === "wrong-url") {
    return "The desktop bridge URL is invalid. Check Sources & Devices.";
  }
  return `Start the desktop bridge to ${startVerb} torrent sources on this device.`;
}

function bridgeRejectReason(bridge?: BridgeHealthHint): PlaybackRejectReason {
  return bridge ? "bridge_unavailable" : "torrent_no_bridge";
}

function titleOf(candidate: MediaCandidate) {
  return candidate.stream.title || candidate.stream.name || "Untitled source";
}

function rejectionMessage(
  reason: PlaybackRejectReason,
  action: PlaybackAction,
  bridge?: BridgeHealthHint,
) {
  switch (reason) {
    case "no_sources":
      return "No sources are available for this title yet.";
    case "unsupported_codec":
      return "Source codec is not supported by this device profile.";
    case "unsupported_container":
      return "Source container is not supported by this device profile.";
    case "bridge_unavailable":
    case "torrent_no_bridge":
      return bridgeMessage(action, bridge);
    case "hls_offline_unsupported":
      return "HLS sources are streaming-only in offline v1.";
    case "cast_device_incompatible":
      return "Source is not compatible with the cast target profile.";
    case "localhost_not_castable":
      return "Cast devices cannot access a source that is only available on localhost.";
    case "source_missing_url":
      return "Source does not expose a playable URL or torrent identifier.";
    case "unknown_stream_type":
      return "Source type is not playable inside the app.";
    case "device_incompatible":
      return "Source is not compatible with this device profile.";
  }
}

function withRemuxHint(candidate: MediaCandidate): MediaCandidate {
  return {
    ...candidate,
    stream: {
      ...candidate.stream,
      behaviorHints: {
        ...candidate.stream.behaviorHints,
        remuxToMp4: true,
      },
    },
  };
}

function withFileSelectionHints(stream: Stream, request: PlaybackPlanRequest) {
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

function actionEligibility(
  action: PlaybackAction,
  eligible: boolean,
  reason?: PlaybackRejectReason,
): PlaybackActionEligibility {
  return { action, eligible, reason };
}

function getCandidateDecisionReasons(
  candidate: MediaCandidate,
  request: PlaybackPlanRequest,
  requiresRemux: boolean,
  compatibility: PlaybackDeviceCompatibility,
) {
  const reasons: PlaybackDecisionReasonCode[] = [];

  if (candidate.kind === "direct") reasons.push("direct_source_preferred");
  if (candidate.kind === "hls") reasons.push("hls_source_preferred");
  if (candidate.kind === "torrent") reasons.push("bridge_source_selected");
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
  request: PlaybackPlanRequest,
): CandidateEvaluation {
  const hasBridge = bridgeAvailable(request.bridge);
  const requiresBridge = candidate.kind === "torrent";
  const requiresRemux =
    candidate.kind === "torrent" &&
    candidateNeedsRemux(candidate, request.deviceProfile);
  const castReachability =
    request.action === "cast" && (!requiresBridge || hasBridge)
      ? getCastSourceReachability(candidate, request.bridge?.url)
      : "reachable";
  const sourceReachable =
    request.action !== "cast" || castReachability === "reachable";
  const deviceCompatibility = getDeviceCompatibility(
    candidate,
    request.deviceProfile,
    sourceReachable,
  );

  if (
    requiresRemux &&
    deviceCompatibility.videoCodecSupported &&
    deviceCompatibility.audioCodecSupported &&
    deviceCompatibility.sourceReachable &&
    request.deviceProfile.supports.mp4
  ) {
    deviceCompatibility.compatible = true;
  }

  let rejectionReason: PlaybackRejectReason | undefined;

  if (candidate.kind === "unknown") {
    rejectionReason = "source_missing_url";
  } else if (candidate.kind === "external") {
    rejectionReason = "unknown_stream_type";
  } else if (request.action === "download" && candidate.kind === "hls") {
    rejectionReason = "hls_offline_unsupported";
  } else if (request.action === "cast" && castReachability === "localhost") {
    rejectionReason = "localhost_not_castable";
  } else if (request.action === "cast" && castReachability === "unreachable") {
    rejectionReason = "cast_device_incompatible";
  } else if (candidateNeedsTranscode(candidate, request.deviceProfile)) {
    rejectionReason =
      request.action === "cast"
        ? "cast_device_incompatible"
        : "unsupported_codec";
  } else if (!deviceCompatibility.containerSupported && !requiresRemux) {
    rejectionReason =
      request.action === "cast"
        ? "cast_device_incompatible"
        : "unsupported_container";
  } else if (
    request.action === "cast" &&
    candidate.kind === "direct" &&
    candidate.container !== "mp4"
  ) {
    rejectionReason = "cast_device_incompatible";
  } else if (requiresBridge && !hasBridge) {
    rejectionReason = bridgeRejectReason(request.bridge);
  } else if (!deviceCompatibility.compatible) {
    rejectionReason = "device_incompatible";
  }

  return {
    candidate,
    score: scoreCandidate(
      candidate,
      request.action,
      request.deviceProfile,
      hasBridge,
    ),
    requiresBridge,
    requiresRemux,
    deviceCompatibility,
    actionEligibility: actionEligibility(
      request.action,
      !rejectionReason,
      rejectionReason,
    ),
    decisionReasons: rejectionReason
      ? []
      : getCandidateDecisionReasons(
          candidate,
          request,
          requiresRemux,
          deviceCompatibility,
        ),
    rejectionReason,
  };
}

function sortEvaluations(a: CandidateEvaluation, b: CandidateEvaluation) {
  const scoreDifference = b.score - a.score;
  if (scoreDifference !== 0) return scoreDifference;
  return candidateSortKey(a.candidate).localeCompare(
    candidateSortKey(b.candidate),
  );
}

function toPlannedCandidate(
  evaluation: CandidateEvaluation,
  rank: number,
): PlannedMediaCandidate {
  const candidate = evaluation.requiresRemux
    ? withRemuxHint(evaluation.candidate)
    : evaluation.candidate;

  return {
    ...candidate,
    rank,
    score: evaluation.score,
    requiresBridge: evaluation.requiresBridge,
    requiresRemux: evaluation.requiresRemux,
    deviceCompatibility: evaluation.deviceCompatibility,
    actionEligibility: evaluation.actionEligibility,
    decisionReasons: evaluation.decisionReasons,
  };
}

function toRejectedCandidate(
  evaluation: CandidateEvaluation,
  bridge?: BridgeHealthHint,
): RejectedCandidate {
  const reasonCode = evaluation.rejectionReason || "device_incompatible";
  return {
    candidateId: evaluation.candidate.id,
    title: titleOf(evaluation.candidate),
    reason: rejectionMessage(
      reasonCode,
      evaluation.actionEligibility.action,
      bridge,
    ),
    reasonCode,
    requiresBridge: evaluation.requiresBridge,
    requiresRemux: evaluation.requiresRemux,
    deviceCompatibility: evaluation.deviceCompatibility,
    actionEligibility: evaluation.actionEligibility,
  };
}

function planMode(candidate: PlannedMediaCandidate): PlaybackPlanMode {
  if (candidate.requiresRemux) return "remux";
  if (candidate.kind === "torrent") return "bridge";
  if (candidate.kind === "hls") return "hls";
  return "direct";
}

function decisionReason(
  code: PlaybackDecisionReasonCode,
  candidateId?: string,
): PlaybackDecisionReason {
  return {
    code,
    message: DECISION_MESSAGES[code],
    candidateId,
  };
}

function selectedDecisionReasons(
  selected: PlannedMediaCandidate,
  fallbackCount: number,
) {
  const reasons = [
    decisionReason("selected_highest_score", selected.id),
    ...selected.decisionReasons.map((code) =>
      decisionReason(code, selected.id),
    ),
  ];

  if (fallbackCount > 0) {
    reasons.push(decisionReason("fallbacks_available"));
  }

  return reasons;
}

function dedupeCandidates(candidates: MediaCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidateSortKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyPlan(
  request: PlaybackPlanRequest,
  state: PlaybackPlan["state"],
  rejectedCandidates: RejectedCandidate[],
  evaluations: CandidateEvaluation[],
  userMessage: string,
  reason?: PlaybackRejectReason,
): PlaybackPlan {
  const leading = [...evaluations].sort(sortEvaluations)[0];
  const requiresBridge = evaluations.some(
    (evaluation) => evaluation.requiresBridge,
  );
  const requiresRemux = evaluations.some(
    (evaluation) => evaluation.requiresRemux,
  );
  const reasons = [decisionReason("no_action_eligible_candidates")];

  if (requiresBridge) {
    reasons.push(decisionReason("bridge_required"));
  }

  return {
    version: 2,
    action: request.action,
    state,
    fallbackCandidates: [],
    orderedCandidates: [],
    rejectedCandidates,
    decisionReasons: reasons,
    actionEligibility: actionEligibility(request.action, false, reason),
    timeoutBudget: { ...TIMEOUT_BUDGETS[request.action] },
    requiresBridge,
    requiresRemux,
    deviceCompatibility: leading?.deviceCompatibility,
    userMessage,
    debug: { rejectedCandidates },
  };
}

export class PlaybackPlannerService {
  async createPlan(
    userId: string,
    request: PlaybackPlanRequest,
    requestId: string,
  ): Promise<PlaybackPlan> {
    const contentId = episodeAwareId(request);
    const streams = await aggregatorService.getStreams(
      userId,
      request.type,
      contentId,
      requestId,
    );

    const candidates = dedupeCandidates(
      streams.map((stream) =>
        normalizeStream(withFileSelectionHints(stream, request)),
      ),
    );

    if (candidates.length === 0) {
      return emptyPlan(
        request,
        "notFound",
        [],
        [],
        "No sources are available for this title yet.",
        "no_sources",
      );
    }

    const evaluations = candidates.map((candidate) =>
      evaluateCandidate(candidate, request),
    );
    const eligibleEvaluations = evaluations
      .filter((evaluation) => evaluation.actionEligibility.eligible)
      .sort(sortEvaluations);
    const rejectedCandidates = evaluations
      .filter((evaluation) => !evaluation.actionEligibility.eligible)
      .sort(sortEvaluations)
      .map((evaluation) => toRejectedCandidate(evaluation, request.bridge));
    const orderedCandidates = eligibleEvaluations.map(toPlannedCandidate);
    const selectedCandidate = orderedCandidates[0];

    if (selectedCandidate) {
      const fallbackCandidates = orderedCandidates.slice(1, 5);
      return {
        version: 2,
        action: request.action,
        state: "ready",
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
        plan: {
          mode: planMode(selectedCandidate),
          selectedCandidate,
          playbackUrl:
            selectedCandidate.kind === "direct" ||
            selectedCandidate.kind === "hls"
              ? selectedCandidate.stream.url
              : undefined,
          fallbackCandidates,
        },
        userMessage: selectedCandidate.requiresRemux
          ? "Preparing this source for your device."
          : undefined,
        debug: { rejectedCandidates },
      };
    }

    const bridgeRejection = rejectedCandidates.find(
      (candidate) =>
        candidate.reasonCode === "bridge_unavailable" ||
        candidate.reasonCode === "torrent_no_bridge",
    );
    if (bridgeRejection) {
      return emptyPlan(
        request,
        request.bridge?.status === "unsupported"
          ? "bridgeUnavailable"
          : "needsBridge",
        rejectedCandidates,
        evaluations,
        bridgeMessage(request.action, request.bridge),
        bridgeRejection.reasonCode,
      );
    }

    const transcodeRejection = rejectedCandidates.find(
      (candidate) => candidate.reasonCode === "unsupported_codec",
    );
    if (transcodeRejection) {
      return emptyPlan(
        request,
        "needsTranscode",
        rejectedCandidates,
        evaluations,
        "This source needs video conversion before it can play on this device.",
        transcodeRejection.reasonCode,
      );
    }

    return emptyPlan(
      request,
      "unsupported",
      rejectedCandidates,
      evaluations,
      "No source is compatible with this device yet.",
      rejectedCandidates[0]?.reasonCode,
    );
  }
}

export const playbackPlannerService = new PlaybackPlannerService();
