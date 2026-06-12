import type {
  BridgeStatus,
  DeviceProfile,
  PlaybackAction,
  PlaybackErrorCode,
} from "./playback";

export type PlaybackSessionStatus =
  | "created"
  | "planning"
  | "checking_bridge"
  | "selecting_candidate"
  | "attempting_candidate"
  | "creating_gateway_job"
  | "preparing_metadata"
  | "finding_peers"
  | "remuxing"
  | "probing_playback_url"
  | "ready"
  | "buffering"
  | "playing"
  | "downloading"
  | "verifying_download"
  | "casting"
  | "trying_fallback"
  | "completed"
  | "failed"
  | "cancelled";

export type PlaybackSessionSourceType =
  | "direct"
  | "hls"
  | "torrent"
  | "external"
  | "unknown"
  | "debrid"
  | "gateway";

export type PlaybackAttemptStatus =
  | "pending"
  | "attempting"
  | "ready"
  | "failed"
  | "skipped"
  | "cancelled";

export type PlaybackGatewayPhase =
  | "creating_gateway_job"
  | "finding_peers"
  | "no_peers"
  | "preparing_metadata"
  | "fetching_metadata"
  | "selecting_file"
  | "checking_piece_availability"
  | "remuxing"
  | "ready"
  | "stalled"
  | "error"
  | "cancelled"
  | "expired";

export interface PlaybackSessionContent {
  type: "movie" | "series";
  id: string;
  season?: number;
  episode?: number;
}

/**
 * Persistence-safe candidate metadata.
 *
 * This deliberately excludes Stream, URL, magnet, infoHash, and externalUrl.
 * The id must be an opaque session-local UUID, not a source-derived identifier.
 */
export interface PlaybackSessionCandidate {
  id: string;
  rank: number;
  sourceType: PlaybackSessionSourceType;
  quality?: "2160p" | "1080p" | "720p" | "480p" | "SD";
  container?: "mp4" | "mkv" | "hls" | "unknown";
  videoCodec?: "h264" | "h265" | "av1" | "unknown";
  audioCodec?: "aac" | "ac3" | "eac3" | "unknown";
  hdr?: "sdr" | "hdr10" | "dolby-vision" | "unknown";
  requiresBridge: boolean;
  requiresRemux: boolean;
  riskFlags: string[];
}

export interface PlaybackSessionError {
  code: PlaybackErrorCode;
  message: string;
  retryable: boolean;
  shouldFallback: boolean;
}

export interface PlaybackAttempt {
  id: string;
  candidateId: string;
  sourceType: PlaybackSessionSourceType;
  status: PlaybackAttemptStatus;
  startedAt?: string;
  endedAt?: string;
  error?: PlaybackSessionError;
}

/**
 * Persistence-safe bridge diagnostics. Bridge URLs are intentionally excluded.
 */
export interface PlaybackSessionBridgeSnapshot {
  status: BridgeStatus;
  reason?: string;
}

/**
 * Capability snapshot for cast planning without persisting a device name or URL.
 */
export interface PlaybackSessionCastProfile {
  supportsHls: boolean;
  supportsMp4: boolean;
  supportsMkv: boolean;
  supportedCodecs?: string[];
  canAccessLocalhost: boolean;
  requiresRemoteReachableUrl: boolean;
  remuxAllowed: boolean;
}

interface PlaybackSessionEventBase {
  id: string;
  sessionId: string;
  at: string;
}

export interface PlaybackSessionCreatedEvent extends PlaybackSessionEventBase {
  type: "session_created";
  action: PlaybackAction;
}

export interface PlaybackSessionStatusChangedEvent extends PlaybackSessionEventBase {
  type: "status_changed";
  from: PlaybackSessionStatus;
  to: PlaybackSessionStatus;
  reason?: string;
}

export interface PlaybackCandidateSelectedEvent extends PlaybackSessionEventBase {
  type: "candidate_selected";
  candidateId: string;
  reason?: string;
}

export interface PlaybackAttemptStartedEvent extends PlaybackSessionEventBase {
  type: "attempt_started";
  attemptId: string;
  candidateId: string;
}

export interface PlaybackAttemptReadyEvent extends PlaybackSessionEventBase {
  type: "attempt_ready";
  attemptId: string;
  candidateId: string;
}

export interface PlaybackAttemptFailedEvent extends PlaybackSessionEventBase {
  type: "attempt_failed";
  attemptId: string;
  candidateId: string;
  error: PlaybackSessionError;
}

export interface PlaybackAttemptSkippedEvent extends PlaybackSessionEventBase {
  type: "attempt_skipped";
  attemptId: string;
  candidateId: string;
  reason: string;
}

export interface PlaybackGatewayJobAttachedEvent extends PlaybackSessionEventBase {
  type: "gateway_job_attached";
  gatewayJobId: string;
  candidateId: string;
}

export interface PlaybackGatewayProgressEvent extends PlaybackSessionEventBase {
  type: "gateway_progress";
  gatewayJobId: string;
  phase: PlaybackGatewayPhase;
  progress?: number;
  peerCount?: number;
}

export interface PlaybackDownloadProgressEvent extends PlaybackSessionEventBase {
  type: "download_progress";
  progress: number;
  totalBytesWritten?: number;
  totalBytesExpectedToWrite?: number;
}

export interface PlaybackDownloadVerifiedEvent extends PlaybackSessionEventBase {
  type: "download_verified";
}

export interface PlaybackFallbackStartedEvent extends PlaybackSessionEventBase {
  type: "fallback_started";
  fromCandidateId: string;
  toCandidateId: string;
  reason: string;
}

export interface PlaybackSessionFailedEvent extends PlaybackSessionEventBase {
  type: "session_failed";
  error: PlaybackSessionError;
}

export interface PlaybackSessionCancelledEvent extends PlaybackSessionEventBase {
  type: "session_cancelled";
  reason?: string;
}

export interface PlaybackSessionCompletedEvent extends PlaybackSessionEventBase {
  type: "session_completed";
}

export type PlaybackSessionEvent =
  | PlaybackSessionCreatedEvent
  | PlaybackSessionStatusChangedEvent
  | PlaybackCandidateSelectedEvent
  | PlaybackAttemptStartedEvent
  | PlaybackAttemptReadyEvent
  | PlaybackAttemptFailedEvent
  | PlaybackAttemptSkippedEvent
  | PlaybackGatewayJobAttachedEvent
  | PlaybackGatewayProgressEvent
  | PlaybackDownloadProgressEvent
  | PlaybackDownloadVerifiedEvent
  | PlaybackFallbackStartedEvent
  | PlaybackSessionFailedEvent
  | PlaybackSessionCancelledEvent
  | PlaybackSessionCompletedEvent;

/**
 * Persisted source of truth for one play, download, or cast workflow.
 *
 * Resolved media URLs remain transient runtime data and must never be added to
 * this contract or its event log.
 */
export interface PlaybackSession {
  schemaVersion: 1;
  id: string;
  action: PlaybackAction;
  status: PlaybackSessionStatus;
  content: PlaybackSessionContent;
  candidates: PlaybackSessionCandidate[];
  attempts: PlaybackAttempt[];
  selectedCandidateId?: string;
  gatewayJobId?: string;
  deviceProfile: DeviceProfile;
  bridge?: PlaybackSessionBridgeSnapshot;
  castProfile?: PlaybackSessionCastProfile;
  timeoutBudgetMs: number;
  terminalError?: PlaybackSessionError;
  eventLog: PlaybackSessionEvent[];
  createdAt: string;
  updatedAt: string;
}
