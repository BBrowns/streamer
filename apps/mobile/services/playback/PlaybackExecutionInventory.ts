import type {
  BridgeDelivery,
  BridgeHealthHint,
  DeviceProfile,
  PlaybackExecutionNode,
  PlaybackRouteCapabilities,
} from "@streamer/shared";

const directCapabilities: PlaybackRouteCapabilities = {
  seek: "immediate",
  audioTracks: false,
  embeddedSubtitles: false,
  externalSubtitles: true,
  cast: true,
  // DownloadService can copy and verify a direct response. The prepared
  // delivery remains `direct`; it is not an offline file yet.
  offline: true,
  thumbnails: false,
};

const hlsCapabilities: PlaybackRouteCapabilities = {
  seek: "immediate",
  audioTracks: true,
  embeddedSubtitles: true,
  externalSubtitles: true,
  cast: true,
  offline: false,
  thumbnails: false,
};

export interface PlaybackExecutionInventoryInput {
  deviceProfile: DeviceProfile;
  bridge?: BridgeHealthHint;
  bridgeProtocolVersion?: 1;
  bridgeDeliveries?: BridgeDelivery[];
  bridgeCastAvailable?: boolean;
}

function onDeviceNode(deviceProfile: DeviceProfile): PlaybackExecutionNode {
  const deliveries: PlaybackExecutionNode["deliveries"] = [];

  if (deviceProfile.supports.mp4) {
    deliveries.push({ delivery: "direct", capabilities: directCapabilities });
  }
  if (deviceProfile.supports.hls) {
    deliveries.push({ delivery: "hls", capabilities: hlsCapabilities });
  }

  return {
    executionTarget: "on-device",
    availability: deliveries.length > 0 ? "available" : "unsupported",
    acceptedSourceKinds:
      deliveries.length > 0
        ? [
            ...(deviceProfile.supports.mp4 ? (["direct"] as const) : []),
            ...(deviceProfile.supports.hls ? (["hls"] as const) : []),
          ]
        : [],
    deliveries,
  };
}

function bridgeRouteCapabilities(
  delivery: BridgeDelivery,
  castAvailable: boolean,
): PlaybackRouteCapabilities {
  if (delivery === "range-http") {
    return {
      seek: "immediate",
      audioTracks: true,
      embeddedSubtitles: true,
      externalSubtitles: true,
      cast: castAvailable,
      offline: false,
      thumbnails: true,
    };
  }

  if (delivery === "seekable-cache") {
    return {
      seek: "immediate",
      audioTracks: true,
      embeddedSubtitles: true,
      externalSubtitles: true,
      cast: castAvailable,
      offline: true,
      thumbnails: true,
    };
  }

  return {
    seek: "preparing",
    audioTracks: true,
    embeddedSubtitles: true,
    externalSubtitles: true,
    cast: false,
    offline: false,
    thumbnails: false,
  };
}

/**
 * Build a URL- and credential-free planner inventory from capabilities that
 * have already been negotiated at the platform boundary.
 */
export function buildPlaybackExecutionNodes(
  input: PlaybackExecutionInventoryInput,
): PlaybackExecutionNode[] {
  const nodes: PlaybackExecutionNode[] = [onDeviceNode(input.deviceProfile)];
  const bridge = input.bridge;
  const bridgeReady =
    (bridge?.status === "available" || bridge?.status === "no-peers") &&
    bridge.configured === true &&
    bridge.endpoint?.deviceReachable === true &&
    input.bridgeProtocolVersion === 1 &&
    (input.bridgeDeliveries?.length ?? 0) > 0;

  if (!bridgeReady) return nodes;

  const executionTarget =
    bridge.endpoint?.scope === "loopback"
      ? ("local-sidecar" as const)
      : ("paired-bridge" as const);
  nodes.push({
    executionTarget,
    availability: "available",
    acceptedSourceKinds: ["torrent"],
    deliveries: input.bridgeDeliveries!.map((delivery) => ({
      delivery,
      capabilities: bridgeRouteCapabilities(
        delivery,
        input.bridgeCastAvailable === true &&
          bridge.endpoint?.castReachable === true,
      ),
    })),
    bridgeProtocolVersion: 1,
  });

  return nodes;
}
