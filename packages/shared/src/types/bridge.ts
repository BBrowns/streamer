import type { NormalizedMediaTrack, SubtitleCandidate } from "./media-track";

export type BridgeProtocolVersion = 1;

/** Maximum JSON request size enforced by both the bridge contract and parser. */
export const BRIDGE_V1_MAX_REQUEST_BYTES = 16 * 1024;

export type BridgeDelivery =
  "range-http" | "progressive-fmp4" | "seekable-cache";

export type BridgeJobState =
  | "preparing"
  | "ready"
  | "no_peers"
  | "stalled"
  | "error"
  | "cancelled"
  | "expired";

export type BridgeJobPhase =
  | "finding_peers"
  | "preparing_metadata"
  | "fetching_metadata"
  | "selecting_file"
  | "checking_piece_availability"
  | "remuxing"
  | "ready"
  | "no_peers"
  | "stalled"
  | "error"
  | "cancelled"
  | "expired";

export type BridgeV1ErrorCode =
  | "INVALID_REQUEST"
  | "AUTH_REQUIRED"
  | "AUTH_NOT_CONFIGURED"
  | "FORBIDDEN"
  | "PROTOCOL_UNSUPPORTED"
  | "IDEMPOTENCY_CONFLICT"
  | "DELIVERY_UNSUPPORTED"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_READY"
  | "JOB_CANCELLED"
  | "JOB_EXPIRED"
  | "NO_PEERS"
  | "SOURCE_STALLED"
  | "RUNTIME_UNAVAILABLE"
  | "TRACKS_UNAVAILABLE"
  | "SUBTITLE_NOT_FOUND"
  | "SUBTITLE_UNAVAILABLE"
  | "THUMBNAIL_UNAVAILABLE"
  | "CAST_DEVICE_NOT_FOUND"
  | "CAST_SESSION_NOT_FOUND"
  | "CAST_SOURCE_REJECTED"
  | "CAST_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface BridgeV1Error {
  code: BridgeV1ErrorCode;
  /** Fixed, redacted, user-safe message. */
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export interface BridgeV1ErrorResponse {
  protocolVersion: 1;
  error: BridgeV1Error;
}

export interface BridgeHelloV1 {
  protocol: {
    name: "streamer-bridge";
    current: 1;
    supported: [1];
  };
  serviceVersion: string;
  auth: {
    required: true;
    methods: ["bearer", "x-streamer-bridge-token"];
  };
}

export type BridgeOwner = "desktop" | "standalone" | "api-supervisor";
export type BridgeHealth = "ready" | "degraded" | "unavailable";

export interface BridgeCapabilityDeliveryV1 {
  delivery: BridgeDelivery;
  available: boolean;
  unavailableReason?: "torrent_unavailable" | "ffmpeg_unavailable";
}

export interface BridgeCapabilitiesV1 {
  protocolVersion: 1;
  owner: BridgeOwner;
  health: BridgeHealth;
  capabilities: {
    jobs: {
      sourceKinds: ["magnet"];
      deliveries: BridgeCapabilityDeliveryV1[];
      cancellation: true;
      tracks: true;
      subtitles: true;
      thumbnails: true;
      metrics: true;
    };
    cast: {
      available: boolean;
      controls: ["play", "pause", "resume", "seek", "stop"];
    };
  };
  limits: {
    maxRequestBytes: number;
    maxSubtitleBytes: number;
    thumbnailBucketSeconds: number;
    maxThumbnailBucket: number;
    maxThumbnailBytes: number;
  };
}

export interface CreateBridgeJobV1 {
  /** Required idempotency key, scoped to the authenticated principal. */
  requestId: string;
  source: {
    kind: "magnet";
    /** Sensitive request-only value; never returned, logged, or persisted. */
    magnet: string;
  };
  delivery: BridgeDelivery;
  selection?: {
    fileIndex?: number;
    title?: string;
    season?: number;
    episode?: number;
  };
}

export type BridgeSeekableCacheStatus =
  "not_started" | "evaluating" | "preparing" | "ready" | "unavailable";

export type BridgeSeekableCacheUnavailableReason =
  | "source_too_large"
  | "insufficient_storage"
  | "no_download_progress"
  | "remux_failed"
  | "timed_out"
  | "cancelled";

export interface BridgeJobMediaV1 {
  container: "mp4" | "webm" | "mkv" | "unknown";
  remuxed: boolean;
  seek: "immediate" | "preparing" | "unavailable";
  seekableCache?: {
    status: BridgeSeekableCacheStatus;
    unavailableReason?: BridgeSeekableCacheUnavailableReason;
  };
}

export interface BridgeJobV1 {
  /** Opaque UUID; never derived from source identity. */
  id: string;
  state: BridgeJobState;
  phase: BridgeJobPhase;
  delivery: BridgeDelivery;
  peerCount: number | null;
  readinessProgress: number | null;
  elapsedMs: number;
  readyTimeoutMs: number;
  media: BridgeJobMediaV1;
  /**
   * Relative, signed v1 path. It is a narrow runtime response and is never
   * copied into persistence, logs, telemetry, or debug bundles.
   */
  stream?: {
    path: string;
    expiresAt: string;
  };
  failure?: BridgeV1Error;
}

export interface BridgeJobResponseV1 {
  protocolVersion: 1;
  job: BridgeJobV1;
}

export interface BridgeJobMetricsV1 {
  protocolVersion: 1;
  jobId: string;
  sampledAt: string;
  state: "finding_peers" | "connecting" | "downloading" | "ready";
  peers: number;
  downloadBytesPerSecond: number;
  downloadedBytes: number;
  torrentProgress: number | null;
}

export type BridgeSubtitleCandidateV1 = Omit<
  SubtitleCandidate,
  "fetchIdentity"
> & {
  /** Opaque random, job-scoped identity used to fetch rendered WebVTT. */
  documentId?: string;
};

export interface BridgeTrackCatalogV1 {
  protocolVersion: 1;
  jobId: string;
  /** Opaque media identity scoped to this bridge job. */
  mediaId: string;
  tracks: NormalizedMediaTrack[];
  subtitles: BridgeSubtitleCandidateV1[];
}

export interface BridgeCastDeviceV1 {
  /** Random process-local identity; never a host or host:port value. */
  id: string;
  name: string;
  type: "chromecast";
}

export interface BridgeCastDevicesV1 {
  protocolVersion: 1;
  devices: BridgeCastDeviceV1[];
}

export interface BridgeCastPlayV1 {
  requestId: string;
  deviceId: string;
  source:
    | { kind: "bridge-job"; jobId: string }
    | {
        kind: "external-url";
        /** Sensitive runtime-only request value, revalidated by the bridge. */
        url: string;
        contentType:
          | "video/mp4"
          | "application/vnd.apple.mpegurl"
          | "application/x-mpegURL";
      };
  title?: string;
}

export type BridgeCastControlAction =
  "play" | "pause" | "resume" | "seek" | "stop";

export interface BridgeCastControlV1 {
  deviceId: string;
  action: BridgeCastControlAction;
  positionSeconds?: number;
}

export interface BridgeCommandResponseV1 {
  protocolVersion: 1;
  success: true;
}

export const bridgeOperationalCounterNames = [
  "rate_limited",
  "session_issued",
  "session_renewed",
  "session_revoked",
  "idempotency_conflict",
  "terminal_no_peers",
  "terminal_stalled",
  "terminal_error",
  "terminal_cancelled",
  "terminal_expired",
] as const;

export type BridgeOperationalCounterName =
  (typeof bridgeOperationalCounterNames)[number];

export type BridgeOperationalMetricsCounters = Record<
  BridgeOperationalCounterName,
  number
>;

/**
 * Process-local, privacy-safe bridge health counters. The snapshot contains
 * no request ids, job ids, source identities, URLs, or credentials.
 */
export interface BridgeOperationalMetricsV1 {
  protocolVersion: 1;
  sampledAt: string;
  counters: BridgeOperationalMetricsCounters;
}

export interface BridgeCastStatusV1 {
  protocolVersion: 1;
  deviceId: string;
  currentTime: number;
  duration: number;
  isPaused: boolean;
  playerState: string;
}

export type BridgeAccessScope =
  "capabilities:read" | "jobs:read" | "jobs:write" | "cast:read" | "cast:write";

export interface CreateBridgeAccessSessionV1 {
  scopes: BridgeAccessScope[];
  /** Defaults to 300 seconds when omitted from input. */
  ttlSeconds: number;
}

export interface BridgeAccessSessionV1 {
  protocolVersion: 1;
  sessionId: string;
  accessToken: string;
  expiresAt: string;
}
