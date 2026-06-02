import type {
  PlaybackAction,
  PlaybackErrorCode,
  PlaybackPlan,
  PlaybackRuntimeError,
  PlaybackRuntimeState,
} from "@streamer/shared";

export interface PlaybackRuntimeFailure {
  error: PlaybackRuntimeError;
  runtimeState: PlaybackRuntimeState;
}

const CODE_TO_STATE: Record<PlaybackErrorCode, PlaybackRuntimeState> = {
  NO_SOURCES: "failed_no_sources",
  NO_PEERS: "failed_no_peers",
  BRIDGE_UNAVAILABLE: "failed_bridge_unavailable",
  BRIDGE_UNSUPPORTED: "failed_bridge_unsupported",
  UNSUPPORTED_CODEC: "failed_unsupported_codec",
  GATEWAY_TIMEOUT: "failed_timeout",
  SOURCE_UNAVAILABLE: "failed_unknown",
  NETWORK_OFFLINE: "failed_network",
  PLAYBACK_TIMEOUT: "failed_timeout",
  UNKNOWN: "failed_unknown",
};

const DEFAULT_MESSAGES: Record<PlaybackErrorCode, string> = {
  NO_SOURCES: "No playable sources were found for this title.",
  NO_PEERS: "This source did not find enough peers to start playback.",
  BRIDGE_UNAVAILABLE:
    "Open the desktop bridge or connect this device to a bridge URL.",
  BRIDGE_UNSUPPORTED:
    "The bridge is reachable, but its streaming engine is not available.",
  UNSUPPORTED_CODEC: "This source is not compatible with this device.",
  GATEWAY_TIMEOUT: "The media gateway took too long to prepare this source.",
  SOURCE_UNAVAILABLE: "This source did not return a playable URL.",
  NETWORK_OFFLINE: "The network connection failed while preparing playback.",
  PLAYBACK_TIMEOUT: "Playback did not start in time.",
  UNKNOWN: "Playback is unavailable right now.",
};

const RETRYABLE_CODES = new Set<PlaybackErrorCode>([
  "NO_PEERS",
  "GATEWAY_TIMEOUT",
  "SOURCE_UNAVAILABLE",
  "NETWORK_OFFLINE",
  "PLAYBACK_TIMEOUT",
  "UNKNOWN",
]);

const FALLBACK_CODES = new Set<PlaybackErrorCode>([
  "NO_PEERS",
  "SOURCE_UNAVAILABLE",
  "UNSUPPORTED_CODEC",
  "GATEWAY_TIMEOUT",
  "NETWORK_OFFLINE",
  "PLAYBACK_TIMEOUT",
  "UNKNOWN",
]);

export function createPlaybackRuntimeError(
  code: PlaybackErrorCode,
  message = DEFAULT_MESSAGES[code],
  overrides: Partial<
    Pick<PlaybackRuntimeError, "retryable" | "shouldFallback" | "debugMessage">
  > = {},
): PlaybackRuntimeError {
  return {
    code,
    message,
    retryable: overrides.retryable ?? RETRYABLE_CODES.has(code),
    shouldFallback: overrides.shouldFallback ?? FALLBACK_CODES.has(code),
    debugMessage: overrides.debugMessage,
  };
}

export function getPlaybackRuntimeState(
  code: PlaybackErrorCode,
): PlaybackRuntimeState {
  return CODE_TO_STATE[code];
}

export function inferPlaybackErrorCodeFromMessages(
  errors: string[] = [],
): PlaybackErrorCode | null {
  const text = errors.join(" ").toLowerCase();
  if (!text.trim()) return null;

  if (
    text.includes("no peers") ||
    text.includes("not enough peers") ||
    text.includes("finding peers") ||
    text.includes("metadata timed out") ||
    text.includes("torrent metadata")
  ) {
    return "NO_PEERS";
  }

  if (
    (text.includes("bridge") || text.includes("gateway")) &&
    (text.includes("unreachable") ||
      text.includes("wrong-url") ||
      text.includes("required") ||
      text.includes("not configured"))
  ) {
    return "BRIDGE_UNAVAILABLE";
  }

  if (
    text.includes("torrent engine") ||
    text.includes("streaming engine") ||
    text.includes("node-datachannel") ||
    text.includes("architecture") ||
    text.includes("cpu mismatch") ||
    text.includes("incompatible architecture")
  ) {
    return "BRIDGE_UNSUPPORTED";
  }

  if (
    text.includes("unsupported codec") ||
    text.includes("codec not supported") ||
    text.includes("unsupported container") ||
    text.includes("hevc") ||
    text.includes("h.265") ||
    text.includes("h265") ||
    text.includes("av1")
  ) {
    return "UNSUPPORTED_CODEC";
  }

  if (
    text.includes("offline") ||
    text.includes("network") ||
    text.includes("econnreset") ||
    text.includes("enotfound") ||
    text.includes("fetch failed")
  ) {
    return "NETWORK_OFFLINE";
  }

  if (text.includes("timeout") || text.includes("timed out")) {
    return "PLAYBACK_TIMEOUT";
  }

  if (
    text.includes("did not return") ||
    text.includes("source unavailable") ||
    text.includes("not playable")
  ) {
    return "SOURCE_UNAVAILABLE";
  }

  return null;
}

export function mapPlaybackPlanToRuntimeFailure(
  plan: PlaybackPlan | null,
  fallback: string,
): PlaybackRuntimeFailure {
  if (!plan) {
    const error = createPlaybackRuntimeError("UNKNOWN", fallback);
    return { error, runtimeState: getPlaybackRuntimeState(error.code) };
  }

  const debugMessage = plan.debug?.rejectedCandidates
    ?.map(
      (candidate) =>
        `${candidate.title || candidate.candidateId}: ${candidate.reason}`,
    )
    .join("; ");
  const message = plan.userMessage || fallback;

  if (plan.state === "needsBridge") {
    const error = createPlaybackRuntimeError("BRIDGE_UNAVAILABLE", message, {
      retryable: true,
      shouldFallback: false,
      debugMessage,
    });
    return { error, runtimeState: getPlaybackRuntimeState(error.code) };
  }

  if (plan.state === "bridgeUnavailable") {
    const error = createPlaybackRuntimeError("BRIDGE_UNSUPPORTED", message, {
      retryable: false,
      shouldFallback: false,
      debugMessage,
    });
    return { error, runtimeState: getPlaybackRuntimeState(error.code) };
  }

  if (plan.state === "needsTranscode" || plan.state === "unsupported") {
    const error = createPlaybackRuntimeError("UNSUPPORTED_CODEC", message, {
      retryable: plan.state === "needsTranscode",
      debugMessage,
    });
    return { error, runtimeState: getPlaybackRuntimeState(error.code) };
  }

  if (plan.state === "notFound") {
    const error = createPlaybackRuntimeError("NO_SOURCES", message, {
      retryable: false,
      shouldFallback: false,
      debugMessage,
    });
    return { error, runtimeState: getPlaybackRuntimeState(error.code) };
  }

  const error = createPlaybackRuntimeError("UNKNOWN", fallback, {
    debugMessage,
  });
  return { error, runtimeState: getPlaybackRuntimeState(error.code) };
}

export function mapResolveErrorsToRuntimeFailure(
  errors: string[] = [],
  fallback: string,
): PlaybackRuntimeFailure {
  const code =
    inferPlaybackErrorCodeFromMessages(errors) || "SOURCE_UNAVAILABLE";
  const error = createPlaybackRuntimeError(code, fallback, {
    debugMessage: errors.join("; ") || undefined,
  });
  return { error, runtimeState: getPlaybackRuntimeState(error.code) };
}

export function mapPlaybackMessageToRuntimeFailure(
  message: string,
  fallbackCode: PlaybackErrorCode = "UNKNOWN",
  overrides: Partial<
    Pick<PlaybackRuntimeError, "retryable" | "shouldFallback" | "debugMessage">
  > = {},
): PlaybackRuntimeFailure {
  const code = inferPlaybackErrorCodeFromMessages([message]) || fallbackCode;
  const error = createPlaybackRuntimeError(code, message, overrides);
  return { error, runtimeState: getPlaybackRuntimeState(error.code) };
}

export function getPlaybackActionFallback(
  action: PlaybackAction,
  fallback: string,
): string {
  if (fallback.trim()) return fallback;

  if (action === "download") return "Download is unavailable right now.";
  if (action === "cast") return "Casting is unavailable right now.";
  return "Playback is unavailable right now.";
}
