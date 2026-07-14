export type ActionPreflightAction = "play" | "download" | "cast";

export type ActionPreflightSourceKind =
  | "direct"
  | "hls"
  | "torrent"
  | "external"
  | "unknown";

export type ActionEndpointScope =
  | "loopback"
  | "lan"
  | "remote"
  | "invalid"
  | "unknown";

export type ActionBridgeUrlValidationReason =
  | "missing-url"
  | "invalid-url"
  | "invalid-protocol"
  | "credentials-not-allowed"
  | "not-local-or-lan";

export type ActionBridgeUrlValidationResult =
  | {
      ok: true;
      url: string;
      scope: "loopback" | "lan";
    }
  | {
      ok: false;
      reason: ActionBridgeUrlValidationReason;
      scope: ActionEndpointScope;
    };

export type ActionPreflightReason =
  | "ready"
  | "source_unsupported"
  | "hls_offline_unsupported"
  | "cast_source_loopback"
  | "cast_source_unreachable"
  | "bridge_not_configured"
  | "bridge_checking"
  | "bridge_url_invalid"
  | "bridge_loopback_unreachable"
  | "bridge_unreachable"
  | "bridge_auth_required"
  | "bridge_runtime_unsupported"
  | "gateway_unavailable"
  | "torrent_engine_unavailable"
  | "remux_unavailable"
  | "cast_service_unavailable";

export interface ActionBridgeAuthSnapshot {
  required?: boolean;
  bridgeConfigured?: boolean;
  clientConfigured?: boolean;
}

export interface ActionBridgeCapabilities {
  gateway?: boolean;
  torrent?: boolean;
  remux?: boolean;
  cast?: boolean;
}

export interface ActionBridgeEndpointSnapshot {
  scope: ActionEndpointScope;
  deviceReachable?: boolean;
  castReachable?: boolean;
}

export interface ActionBridgeSnapshot {
  configured?: boolean;
  url?: string;
  status:
    | "available"
    | "unreachable"
    | "wrong-url"
    | "loading"
    | "no-peers"
    | "unsupported";
  endpoint?: ActionBridgeEndpointSnapshot;
  auth?: ActionBridgeAuthSnapshot;
  capabilities?: ActionBridgeCapabilities;
}

export interface ActionPreflightInput {
  action: ActionPreflightAction;
  platform: "ios" | "android" | "web" | "electron" | "chromecast" | "unknown";
  source: {
    kind: ActionPreflightSourceKind;
    endpoint?: ActionEndpointScope;
    requiresRemux?: boolean;
  };
  bridge?: ActionBridgeSnapshot;
}

export interface ActionPreflightResult {
  action: ActionPreflightAction;
  ready: boolean;
  reason: ActionPreflightReason;
  message: string;
  requiresBridge: boolean;
  retryable: boolean;
}
