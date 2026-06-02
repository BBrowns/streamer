import type { Stream } from "./stream";

export type PlaybackAction = "play" | "download" | "cast";

export type PlaybackPlanState =
  | "ready"
  | "needsBridge"
  | "bridgeUnavailable"
  | "needsTranscode"
  | "unsupported"
  | "notFound";

export type PlaybackPlanMode =
  | "direct"
  | "hls"
  | "bridge"
  | "remux"
  | "transcode";

export type PlaybackRuntimeState =
  | "idle"
  | "planning"
  | "selecting_source"
  | "checking_bridge"
  | "creating_gateway_job"
  | "preparing_metadata"
  | "finding_peers"
  | "buffering"
  | "playing"
  | "trying_fallback"
  | "failed_no_sources"
  | "failed_no_peers"
  | "failed_bridge_unavailable"
  | "failed_bridge_unsupported"
  | "failed_unsupported_codec"
  | "failed_timeout"
  | "failed_network"
  | "failed_unknown"
  | "cancelled";

export type PlaybackErrorCode =
  | "NO_SOURCES"
  | "NO_PEERS"
  | "BRIDGE_UNAVAILABLE"
  | "BRIDGE_UNSUPPORTED"
  | "UNSUPPORTED_CODEC"
  | "GATEWAY_TIMEOUT"
  | "SOURCE_UNAVAILABLE"
  | "NETWORK_OFFLINE"
  | "PLAYBACK_TIMEOUT"
  | "UNKNOWN";

export interface PlaybackRuntimeError {
  code: PlaybackErrorCode;
  message: string;
  retryable: boolean;
  shouldFallback: boolean;
  debugMessage?: string;
}

export type DevicePlatform =
  | "ios"
  | "android"
  | "web"
  | "electron"
  | "chromecast"
  | "unknown";

export type BridgeStatus =
  | "available"
  | "unreachable"
  | "wrong-url"
  | "loading"
  | "no-peers"
  | "unsupported";

export interface DeviceProfile {
  platform: DevicePlatform;
  maxQuality: "2160p" | "1080p" | "720p" | "480p";
  network: "local" | "remote" | "unknown";
  supports: {
    h264: boolean;
    h265: boolean;
    av1: boolean;
    mp4: boolean;
    mkv: boolean;
    hls: boolean;
    dolbyVision: boolean;
    aac: boolean;
    ac3: boolean;
    eac3: boolean;
  };
}

export interface BridgeHealthHint {
  status: BridgeStatus;
  url?: string;
  reason?: string;
}

export interface PlaybackPlanRequest {
  type: "movie" | "series";
  id: string;
  season?: number;
  episode?: number;
  action: PlaybackAction;
  deviceProfile: DeviceProfile;
  bridge?: BridgeHealthHint;
}

export interface MediaCandidate {
  id: string;
  stream: Stream;
  kind: "direct" | "hls" | "torrent" | "external" | "unknown";
  quality?: "2160p" | "1080p" | "720p" | "480p" | "SD";
  container?: "mp4" | "mkv" | "hls" | "unknown";
  videoCodec?: "h264" | "h265" | "av1" | "unknown";
  audioCodec?: "aac" | "ac3" | "eac3" | "unknown";
  hdr?: "sdr" | "hdr10" | "dolby-vision" | "unknown";
  seeders?: number;
  sizeBytes?: number;
  riskFlags: string[];
}

export interface RejectedCandidate {
  candidateId: string;
  title?: string;
  reason: string;
}

export interface PlaybackPlan {
  state: PlaybackPlanState;
  plan?: {
    mode: PlaybackPlanMode;
    selectedCandidate: MediaCandidate;
    fallbackCandidates?: MediaCandidate[];
    playbackUrl?: string;
  };
  userMessage?: string;
  debug?: {
    rejectedCandidates: RejectedCandidate[];
  };
}
