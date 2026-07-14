import type {
  ActionEndpointScope,
  ActionBridgeUrlValidationResult,
  ActionPreflightAction,
  ActionPreflightInput,
  ActionPreflightReason,
  ActionPreflightResult,
} from "./types/action-preflight";

function normalizeHost(host: string) {
  return host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

function isIpv4Lan(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isIpv6Lan(host: string) {
  return (
    host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")
  );
}

export function classifyActionEndpoint(
  rawUrl?: string | null,
): ActionEndpointScope {
  if (!rawUrl?.trim()) return "unknown";

  try {
    const url = new URL(rawUrl);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return "invalid";
    }

    const host = normalizeHost(url.hostname);
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "::1" ||
      host === "::" ||
      host === "0.0.0.0" ||
      host.startsWith("127.")
    ) {
      return "loopback";
    }

    if (host === "10.0.2.2" || isIpv4Lan(host) || isIpv6Lan(host)) {
      return "lan";
    }
    return "remote";
  } catch {
    return "invalid";
  }
}

export function validateActionBridgeUrl(
  rawUrl?: string | null,
): ActionBridgeUrlValidationResult {
  if (!rawUrl?.trim()) {
    return { ok: false, reason: "missing-url", scope: "unknown" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid-url", scope: "invalid" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "invalid-protocol", scope: "invalid" };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: "credentials-not-allowed",
      scope: "invalid",
    };
  }

  const scope = classifyActionEndpoint(parsed.toString());
  if (scope !== "loopback" && scope !== "lan") {
    return { ok: false, reason: "not-local-or-lan", scope };
  }

  return {
    ok: true,
    url: parsed.toString().replace(/\/$/, ""),
    scope,
  };
}

function actionVerb(action: ActionPreflightAction) {
  if (action === "download") return "download";
  if (action === "cast") return "cast";
  return "play";
}

export function getActionPreflightMessage(
  action: ActionPreflightAction,
  reason: ActionPreflightReason,
) {
  const verb = actionVerb(action);

  switch (reason) {
    case "ready":
      return `Ready to ${verb}.`;
    case "source_unsupported":
      return `This source cannot be used to ${verb} inside the app.`;
    case "hls_offline_unsupported":
      return "HLS sources are streaming-only and cannot be saved offline yet.";
    case "cast_source_loopback":
      return "The cast device cannot access a source that only exists on localhost.";
    case "cast_source_unreachable":
      return "The cast device cannot reach this source.";
    case "bridge_not_configured":
      return `Connect the desktop bridge in Sources & Devices to ${verb} this source.`;
    case "bridge_checking":
      return "The desktop bridge is still being checked.";
    case "bridge_url_invalid":
      return "The desktop bridge URL is invalid. Check Sources & Devices.";
    case "bridge_loopback_unreachable":
      return "This device cannot reach a desktop bridge through localhost. Use the desktop LAN URL.";
    case "bridge_unreachable":
      return "The desktop bridge is not reachable. Start the desktop app and check the connection.";
    case "bridge_auth_required":
      return "The desktop bridge needs a valid pairing token in Sources & Devices.";
    case "bridge_runtime_unsupported":
      return "The desktop bridge is connected, but its media runtime needs repair.";
    case "gateway_unavailable":
      return "The desktop bridge media gateway is unavailable.";
    case "torrent_engine_unavailable":
      return "The desktop bridge is connected, but its torrent engine is unavailable.";
    case "remux_unavailable":
      return "The desktop bridge cannot prepare this source because its compatibility runtime is unavailable.";
    case "cast_service_unavailable":
      return "The desktop bridge casting service is unavailable.";
  }
}

function result(
  input: ActionPreflightInput,
  reason: ActionPreflightReason,
  requiresBridge: boolean,
): ActionPreflightResult {
  return {
    action: input.action,
    ready: reason === "ready",
    reason,
    message: getActionPreflightMessage(input.action, reason),
    requiresBridge,
    retryable: new Set<ActionPreflightReason>([
      "bridge_not_configured",
      "bridge_checking",
      "bridge_url_invalid",
      "bridge_loopback_unreachable",
      "bridge_unreachable",
      "bridge_auth_required",
      "bridge_runtime_unsupported",
      "gateway_unavailable",
      "torrent_engine_unavailable",
      "remux_unavailable",
      "cast_service_unavailable",
    ]).has(reason),
  };
}

export function evaluateActionPreflight(
  input: ActionPreflightInput,
): ActionPreflightResult {
  const { source, bridge } = input;

  if (source.kind === "external" || source.kind === "unknown") {
    return result(input, "source_unsupported", false);
  }

  if (input.action === "download" && source.kind === "hls") {
    return result(input, "hls_offline_unsupported", false);
  }

  if (input.action === "cast" && source.kind !== "torrent") {
    if (source.endpoint === "loopback") {
      return result(input, "cast_source_loopback", true);
    }
    if (source.endpoint === "invalid" || source.endpoint === "unknown") {
      return result(input, "cast_source_unreachable", true);
    }
  }

  // The current cast transport and every torrent/remux source use the desktop
  // bridge. Direct/HLS play and direct downloads intentionally bypass it.
  const requiresBridge =
    input.action === "cast" ||
    source.kind === "torrent" ||
    source.requiresRemux === true;
  if (!requiresBridge) return result(input, "ready", false);

  if (!bridge) {
    return result(input, "bridge_not_configured", true);
  }

  const endpoint =
    bridge.endpoint ??
    (bridge.url
      ? {
          scope: classifyActionEndpoint(bridge.url),
        }
      : undefined);

  if (bridge.status === "wrong-url" || endpoint?.scope === "invalid") {
    return result(input, "bridge_url_invalid", true);
  }

  if (bridge.configured === false) {
    return result(input, "bridge_not_configured", true);
  }

  if (bridge.status === "loading") {
    return result(input, "bridge_checking", true);
  }

  const nativeTarget = input.platform === "ios" || input.platform === "android";
  if (
    endpoint?.deviceReachable === false ||
    (nativeTarget && endpoint?.scope === "loopback") ||
    (input.action === "cast" &&
      (endpoint?.castReachable === false || endpoint?.scope === "loopback"))
  ) {
    return result(input, "bridge_loopback_unreachable", true);
  }

  if (
    bridge.auth?.required &&
    (bridge.auth.bridgeConfigured === false ||
      bridge.auth.clientConfigured === false)
  ) {
    return result(input, "bridge_auth_required", true);
  }

  if (bridge.status === "unreachable") {
    return result(input, "bridge_unreachable", true);
  }

  if (bridge.capabilities?.gateway === false) {
    return result(input, "gateway_unavailable", true);
  }

  if (source.kind === "torrent" && bridge.capabilities?.torrent === false) {
    return result(input, "torrent_engine_unavailable", true);
  }

  if (source.requiresRemux && bridge.capabilities?.remux === false) {
    return result(input, "remux_unavailable", true);
  }

  if (input.action === "cast" && bridge.capabilities?.cast === false) {
    return result(input, "cast_service_unavailable", true);
  }

  if (bridge.status === "unsupported") {
    return result(input, "bridge_runtime_unsupported", true);
  }

  // `no-peers` belongs to a previous torrent job, not bridge liveness. A new
  // candidate must still be allowed to run its own peer discovery.
  if (bridge.status === "available" || bridge.status === "no-peers") {
    return result(input, "ready", true);
  }

  return result(input, "bridge_unreachable", true);
}
