import Constants from "expo-constants";
import type {
  ActionPreflightResult,
  BridgeHealthHint,
  DeviceProfile,
  PlaybackAction,
  Stream,
} from "@streamer/shared";
import {
  classifyActionEndpoint,
  evaluateActionPreflight,
  validateActionBridgeUrl,
} from "@streamer/shared";
import { useAuthStore } from "../stores/authStore";
import { getDeviceProfile } from "./playback/deviceProfile";
import {
  streamEngineManager,
  type BridgeDiagnostics,
} from "./streamEngine/StreamEngineManager";

function isLocalIosSimulator() {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (!host) return false;
  return classifyActionEndpoint(`http://${host}`) === "loopback";
}

function endpointReachability(
  url: string | undefined,
  platform: DeviceProfile["platform"],
  knownScope?: ReturnType<typeof classifyActionEndpoint>,
) {
  const scope = knownScope ?? classifyActionEndpoint(url);
  const deviceReachable =
    scope !== "invalid" &&
    scope !== "unknown" &&
    (scope !== "loopback" ||
      platform === "web" ||
      platform === "electron" ||
      (platform === "ios" && isLocalIosSimulator()));

  return {
    scope,
    deviceReachable,
    castReachable:
      scope !== "loopback" && scope !== "invalid" && scope !== "unknown",
  } as const;
}

export function buildActionBridgeHint(
  options: {
    diagnostics?: BridgeDiagnostics;
    url?: string | null;
    deviceProfile?: DeviceProfile;
  } = {},
): BridgeHealthHint {
  const diagnostics =
    options.diagnostics ??
    (typeof streamEngineManager.getBridgeDiagnostics === "function"
      ? streamEngineManager.getBridgeDiagnostics()
      : ({
          status: streamEngineManager.bridgeStatus,
          url: streamEngineManager.bridgeUrl,
        } as BridgeDiagnostics));
  const authState = useAuthStore.getState();
  const deviceProfile = options.deviceProfile ?? getDeviceProfile();
  let rawUrl = options.url || authState.streamServerUrl;
  if (
    !rawUrl &&
    (diagnostics.status === "available" || diagnostics.status === "no-peers") &&
    typeof streamEngineManager.getBridgeUrl === "function"
  ) {
    rawUrl = streamEngineManager.getBridgeUrl();
  }
  rawUrl ||= diagnostics.url || streamEngineManager.bridgeUrl;
  const validation = validateActionBridgeUrl(rawUrl);
  const url = validation.ok ? validation.url : undefined;
  const reason =
    diagnostics.reason || (validation.ok ? undefined : validation.reason);

  return {
    status: validation.ok ? diagnostics.status : "wrong-url",
    ...(url ? { url } : {}),
    ...(reason ? { reason } : {}),
    configured: validation.ok,
    endpoint: endpointReachability(
      url,
      deviceProfile.platform,
      validation.scope,
    ),
    auth: {
      required: diagnostics.auth?.required,
      bridgeConfigured: diagnostics.auth?.configured,
      clientConfigured: Boolean(authState.streamServerToken?.trim()),
    },
    capabilities: diagnostics.capabilities,
  };
}

export function getStreamPreflightKind(stream: Stream) {
  const url = stream.url?.toLowerCase() ?? "";
  const externalUrl = stream.externalUrl?.toLowerCase() ?? "";

  if (stream.infoHash) return "torrent" as const;
  if (url.includes(".m3u8") || externalUrl.includes(".m3u8")) {
    return "hls" as const;
  }
  if (stream.url) return "direct" as const;
  if (stream.externalUrl) return "external" as const;
  return "unknown" as const;
}

export function preflightStreamAction(
  action: PlaybackAction,
  stream: Stream,
  options: {
    deviceProfile?: DeviceProfile;
    requiresRemux?: boolean;
    bridge?: BridgeHealthHint;
  } = {},
): ActionPreflightResult {
  const deviceProfile = options.deviceProfile ?? getDeviceProfile();
  const kind = getStreamPreflightKind(stream);
  const sourceUrl = stream.url || stream.externalUrl;

  return evaluateActionPreflight({
    action,
    platform: deviceProfile.platform,
    source: {
      kind,
      endpoint: classifyActionEndpoint(sourceUrl),
      requiresRemux:
        options.requiresRemux ?? stream.behaviorHints?.remuxToMp4 === true,
    },
    bridge: options.bridge ?? buildActionBridgeHint({ deviceProfile }),
  });
}

export function preflightBridgeAction(
  action: PlaybackAction,
  options: {
    deviceProfile?: DeviceProfile;
    diagnostics?: BridgeDiagnostics;
    url?: string | null;
    sourceKind?: "direct" | "torrent";
  } = {},
): ActionPreflightResult {
  const deviceProfile = options.deviceProfile ?? getDeviceProfile();
  return evaluateActionPreflight({
    action,
    platform: deviceProfile.platform,
    source: {
      kind: options.sourceKind ?? "torrent",
      endpoint: "remote",
    },
    bridge: buildActionBridgeHint({
      diagnostics: options.diagnostics,
      url: options.url,
      deviceProfile,
    }),
  });
}

export class ActionPreflightError extends Error {
  constructor(readonly preflight: ActionPreflightResult) {
    super(preflight.message);
    this.name = "ActionPreflightError";
  }
}

export function requireActionPreflight(result: ActionPreflightResult) {
  if (!result.ready) throw new ActionPreflightError(result);
  return result;
}
