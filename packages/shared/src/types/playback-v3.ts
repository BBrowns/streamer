import type {
  PlaybackActionEligibility,
  PlaybackPlan,
  PlaybackPlanRequest,
  PlaybackRejectReason,
  PlannedMediaCandidate,
  RejectedCandidate,
} from "./playback";

/**
 * A logical runtime that can execute a playback route.
 *
 * These values describe ownership only. Endpoint URLs, credentials, and
 * resolved media locations remain runtime-local to the selected executor.
 */
export type PlaybackExecutionTarget =
  | "on-device"
  | "local-sidecar"
  | "paired-bridge"
  | "debrid"
  | "remote-bridge";

export type PlaybackDelivery =
  | "direct"
  | "hls"
  | "range-http"
  | "progressive-fmp4"
  | "seekable-cache"
  | "offline-file";

export interface PlaybackRouteCapabilities {
  seek: "immediate" | "preparing" | "unavailable";
  audioTracks: boolean;
  embeddedSubtitles: boolean;
  externalSubtitles: boolean;
  cast: boolean;
  offline: boolean;
  thumbnails: boolean;
}

/**
 * Safe control-plane route. It intentionally contains no executable URI or
 * credential; SourcePreparer resolves those only after a route is selected.
 */
export interface PlaybackRoute {
  candidateId: string;
  executionTarget: PlaybackExecutionTarget;
  delivery: PlaybackDelivery;
  capabilities: PlaybackRouteCapabilities;
}

export type PlaybackRoutableSourceKind = "direct" | "hls" | "torrent";

export interface PlaybackExecutionNodeDelivery {
  delivery: PlaybackDelivery;
  capabilities: PlaybackRouteCapabilities;
}

export interface PlaybackExecutionNode {
  executionTarget: PlaybackExecutionTarget;
  availability: "available" | "checking" | "unavailable" | "unsupported";
  acceptedSourceKinds: PlaybackRoutableSourceKind[];
  deliveries: PlaybackExecutionNodeDelivery[];
  bridgeProtocolVersion?: number;
}

/**
 * Planner v3 replaces the v2 bridge hint with an explicit, URL-free inventory
 * of execution nodes. Planner v2 remains available during the migration.
 */
export interface PlaybackPlanV3Request extends Omit<
  PlaybackPlanRequest,
  "bridge"
> {
  version: 3;
  executionNodes: PlaybackExecutionNode[];
}

export type PlaybackRouteRejectReason =
  | "execution_target_unavailable"
  | "source_kind_unsupported"
  | "delivery_unsupported"
  | "action_capability_unsupported"
  | "protocol_unsupported";

export type PlaybackRejectReasonV3 =
  | PlaybackRejectReason
  | PlaybackRouteRejectReason;

export interface PlaybackActionEligibilityV3 extends Omit<
  PlaybackActionEligibility,
  "reason"
> {
  reason?: PlaybackRejectReasonV3;
}

export interface PlannedMediaCandidateV3 extends Omit<
  PlannedMediaCandidate,
  "actionEligibility"
> {
  route: PlaybackRoute;
  actionEligibility: PlaybackActionEligibilityV3;
}

export interface RejectedCandidateV3 extends Omit<
  RejectedCandidate,
  "reasonCode" | "actionEligibility"
> {
  reasonCode: PlaybackRejectReasonV3;
  actionEligibility: PlaybackActionEligibilityV3;
}

/**
 * Planner v3 keeps the v2 compatibility mirrors while clients migrate.
 * `route` is authoritative; the schema enforces that the mirrors agree.
 * The v2 nested `plan` wrapper is deliberately absent.
 */
export interface PlaybackPlanV3 extends Omit<
  PlaybackPlan,
  | "version"
  | "selectedCandidate"
  | "fallbackCandidates"
  | "orderedCandidates"
  | "rejectedCandidates"
  | "actionEligibility"
  | "plan"
  | "debug"
> {
  version: 3;
  selectedCandidate?: PlannedMediaCandidateV3;
  fallbackCandidates: PlannedMediaCandidateV3[];
  orderedCandidates: PlannedMediaCandidateV3[];
  rejectedCandidates: RejectedCandidateV3[];
  actionEligibility: PlaybackActionEligibilityV3;
  debug?: {
    rejectedCandidates: RejectedCandidateV3[];
  };
}

export type PlaybackPlanResponse = PlaybackPlan | PlaybackPlanV3;
export type PlaybackPlanCandidate =
  | PlannedMediaCandidate
  | PlannedMediaCandidateV3;
export type PlaybackPlanRejectedCandidate =
  | RejectedCandidate
  | RejectedCandidateV3;
