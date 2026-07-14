import type { Stream } from "./stream";
import type {
  ActionBridgeAuthSnapshot,
  ActionBridgeCapabilities,
  ActionBridgeEndpointSnapshot,
  ActionPreflightReason,
} from "./action-preflight";

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
  | "failed_no_playable_source"
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
  | "NO_PLAYABLE_SOURCE"
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
  configured?: boolean;
  endpoint?: ActionBridgeEndpointSnapshot;
  auth?: ActionBridgeAuthSnapshot;
  capabilities?: ActionBridgeCapabilities;
}

export interface PlaybackPlanRequest {
  type: "movie" | "series";
  id: string;
  season?: number;
  episode?: number;
  action: PlaybackAction;
  deviceProfile: DeviceProfile;
  preferences?: {
    preferredAudioLanguage?: string | null;
    preferredSubtitleLanguage?: string | null;
  };
  bridge?: BridgeHealthHint;
}

export type AudioLanguage =
  | "en"
  | "nl"
  | "es"
  | "de"
  | "fr"
  | "it"
  | "pt"
  | "ru"
  | "hi"
  | "multi"
  | "unknown";

export interface MediaCandidate {
  /** Opaque runtime identifier. Do not derive or persist it as source identity. */
  id: string;
  stream: Stream;
  kind: "direct" | "hls" | "torrent" | "external" | "unknown";
  quality?: "2160p" | "1080p" | "720p" | "480p" | "SD";
  container?: "mp4" | "mkv" | "hls" | "unknown";
  videoCodec?: "h264" | "h265" | "av1" | "unknown";
  audioCodec?: "aac" | "ac3" | "eac3" | "unknown";
  audioLanguage?: AudioLanguage;
  hdr?: "sdr" | "hdr10" | "dolby-vision" | "unknown";
  seeders?: number;
  sizeBytes?: number;
  riskFlags: string[];
}

export type PlaybackRejectReason =
  | "no_sources"
  | "unsupported_codec"
  | "unsupported_container"
  | "bridge_unavailable"
  | "hls_offline_unsupported"
  | "torrent_no_bridge"
  | "device_incompatible"
  | "cast_device_incompatible"
  | "localhost_not_castable"
  | "source_missing_url"
  | "unknown_stream_type";

export type PlaybackDecisionReasonCode =
  | "selected_highest_score"
  | "direct_source_preferred"
  | "hls_source_preferred"
  | "bridge_source_selected"
  | "remux_selected"
  | "offline_eligible_source_selected"
  | "cast_compatible_source_selected"
  | "device_compatible"
  | "quality_within_profile"
  | "quality_above_profile"
  | "fallbacks_available"
  | "bridge_required"
  | "no_action_eligible_candidates";

export interface PlaybackDecisionReason {
  code: PlaybackDecisionReasonCode;
  message: string;
  candidateId?: string;
}

export interface PlaybackActionEligibility {
  action: PlaybackAction;
  eligible: boolean;
  reason?: PlaybackRejectReason;
  preflightReason?: ActionPreflightReason;
}

export interface PlaybackDeviceCompatibility {
  compatible: boolean;
  containerSupported: boolean;
  videoCodecSupported: boolean;
  audioCodecSupported: boolean;
  qualityWithinProfile: boolean;
  sourceReachable: boolean;
}

export interface PlaybackTimeoutBudget {
  totalMs: number;
  directProbeMs: number;
  hlsProbeMs: number;
  bridgeConnectMs: number;
  torrentMetadataMs: number;
  peerDiscoveryMs: number;
  remuxReadyMs: number;
}

/**
 * Runtime candidate enriched by the planner for the requested action.
 *
 * The candidate id is an opaque UUID. The nested Stream remains transient
 * runtime data and must not be copied into a persisted PlaybackSession.
 */
export interface PlannedMediaCandidate extends MediaCandidate {
  rank: number;
  score: number;
  requiresBridge: boolean;
  requiresRemux: boolean;
  deviceCompatibility: PlaybackDeviceCompatibility;
  actionEligibility: PlaybackActionEligibility;
  decisionReasons: PlaybackDecisionReasonCode[];
}

export interface RejectedCandidate {
  candidateId: string;
  title?: string;
  reason: string;
  reasonCode: PlaybackRejectReason;
  requiresBridge: boolean;
  requiresRemux: boolean;
  deviceCompatibility: PlaybackDeviceCompatibility;
  actionEligibility: PlaybackActionEligibility;
}

export interface PlaybackPlan {
  version: 2;
  action: PlaybackAction;
  state: PlaybackPlanState;
  selectedCandidate?: PlannedMediaCandidate;
  fallbackCandidates: PlannedMediaCandidate[];
  orderedCandidates: PlannedMediaCandidate[];
  rejectedCandidates: RejectedCandidate[];
  decisionReasons: PlaybackDecisionReason[];
  actionEligibility: PlaybackActionEligibility;
  timeoutBudget: PlaybackTimeoutBudget;
  requiresBridge: boolean;
  requiresRemux: boolean;
  deviceCompatibility?: PlaybackDeviceCompatibility;
  plan?: {
    mode: PlaybackPlanMode;
    selectedCandidate: PlannedMediaCandidate;
    fallbackCandidates?: PlannedMediaCandidate[];
    playbackUrl?: string;
  };
  userMessage?: string;
  debug?: {
    rejectedCandidates: RejectedCandidate[];
  };
}
