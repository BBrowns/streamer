import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import {
  createSignedBridgeV1StreamPath,
  createSignedGatewayStreamPath,
  requireBridgeAuth,
  validateGatewayStreamSignature,
} from "./security.js";
import {
  ensureTorrentReady,
  evaluateSeekableRemuxPreparation,
  getClient,
  getRetainedSeekableRemuxSource,
  getSelectedFile,
  isTorrentEngineUnavailableError,
  prepareSeekableRemux,
  retainSeekableRemux,
  prepareTorrent,
  serveTorrentFile,
  shouldRemuxTorrentFile,
  waitForTorrentFileFirstBytes,
  destroyTorrentByInfoHash,
  createHlsRemuxSession,
} from "./torrent.js";
import { seekThumbnailService } from "./seek-thumbnail.js";
import type {
  FileSelectionHints,
  HlsRemuxSession,
  SeekableRemuxUnavailableReason,
} from "./torrent.js";
import { addStreamServerBreadcrumb } from "./sentry.js";
import {
  createMediaProbeCache,
  discoverExternalSubtitleCandidates,
  probeMediaTracksAtUrl,
} from "./media-probe.js";
import {
  bridgeJobResponseV1Schema,
  gatewayTrackCatalogSchema,
  type BridgeDelivery,
  type BridgeV1ErrorCode,
  type BridgeV1Error,
  type SubtitleCandidate,
} from "@streamer/shared";
import {
  extractEmbeddedSubtitleToVtt,
  normalizeSubtitleBuffer,
  readTorrentSubtitleBuffer,
} from "./subtitle-normalizer.js";

export type GatewayJobState =
  | "preparing"
  | "ready"
  | "no_peers"
  | "stalled"
  | "error"
  | "cancelled"
  | "expired";
export type GatewayJobMode = "bridge" | "remux";
export type GatewayRemuxStrategy =
  "seekable-cache" | "progressive-fmp4" | "hls";
export type GatewaySeekableCacheStatus =
  "not_started" | "evaluating" | "preparing" | "ready" | "unavailable";
type GatewaySeekableCacheUnavailableReason =
  SeekableRemuxUnavailableReason | "remux_failed" | "timed_out" | "cancelled";
type GatewayJobPhase =
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
type GatewayFailureCode = Extract<
  BridgeV1ErrorCode,
  "RUNTIME_UNAVAILABLE" | "INTERNAL" | "TRACKS_UNAVAILABLE"
>;

export interface GatewayJob {
  id: string;
  magnet: string;
  infoHash?: string;
  fileIdx?: number;
  hints?: FileSelectionHints;
  mode: GatewayJobMode;
  remuxStrategy: GatewayRemuxStrategy;
  requestedDelivery?: BridgeDelivery;
  state: GatewayJobState;
  error?: string;
  peerCount?: number;
  retryable?: boolean;
  failureCode?: GatewayFailureCode;
  lastPeerCountLogAt?: number;
  lastLoggedPeerCount?: number;
  progressTimer?: ReturnType<typeof setInterval>;
  abortController?: AbortController;
  operationAbortControllers: Set<AbortController>;
  /** Process-local marker used to expose metadata/file-selection progress. */
  metadataReceivedAt?: number;
  firstByteProbeStartedAt?: number;
  remuxStartedAt?: number;
  /**
   * Primary Play opens a live fMP4 response first. Once a consumer exists, a
   * single background +faststart cache is materialized for a later seekable
   * handoff. These fields are process-local and never persisted.
   */
  seekableCacheStatus?: GatewaySeekableCacheStatus;
  seekableCacheStartedAt?: number;
  seekableCacheCompletedAt?: number;
  seekableCacheUnavailableReason?: GatewaySeekableCacheUnavailableReason;
  seekableCacheBytesRead?: number;
  seekableCacheLastProgressAt?: number;
  seekableCacheAbortController?: AbortController;
  seekableCachePromise?: Promise<void>;
  releaseSeekableCache?: () => void;
  /** Process-local selected embedded audio stream for live/cache remuxing. */
  audioTrackId?: string;
  /** Process-local HLS variants; never serialized or persisted. */
  hlsSessions?: Map<string, HlsRemuxSession>;
  /** Single-flight HLS creation per job/variant; never serialized. */
  hlsSessionPromises?: Map<string, Promise<HlsRemuxSession>>;
  /** Abort controllers for HLS variants that are still being created. */
  hlsSessionAbortControllers?: Map<string, AbortController>;
  activeStreamCount: number;
  activeStreamSignature?: string;
  lastStreamAccessAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateGatewayJobInput {
  magnet: string;
  fileIdx?: number;
  hints?: FileSelectionHints;
  mode: GatewayJobMode;
  remuxStrategy: GatewayRemuxStrategy;
  requestedDelivery?: BridgeDelivery;
}

const JOB_TTL_MS = 6 * 60 * 60 * 1000;
const TERMINAL_JOB_TTL_MS = 15 * 60 * 1000;
const UNUSED_READY_JOB_TTL_MS = 5 * 60 * 1000;
const CONSUMED_READY_JOB_TTL_MS = 15 * 60 * 1000;
const JOB_PRUNE_INTERVAL_MS = 60 * 1000;
const GATEWAY_PEER_DISCOVERY_TIMEOUT_MS = 12_000;
const GATEWAY_METADATA_AFTER_PEER_TIMEOUT_MS = 20_000;
// A peer gets up to 20 seconds to provide metadata, but the entire metadata
// phase remains bounded even when that peer arrives at the discovery deadline.
const GATEWAY_METADATA_TIMEOUT_MS =
  GATEWAY_PEER_DISCOVERY_TIMEOUT_MS + GATEWAY_METADATA_AFTER_PEER_TIMEOUT_MS;
const GATEWAY_FIRST_BYTE_TIMEOUT_MS = 20_000;
const GATEWAY_PEER_LOG_INTERVAL_MS = 5_000;
const GATEWAY_REMUX_READY_TIMEOUT_MS = 60_000;
const GATEWAY_BACKGROUND_REMUX_TIMEOUT_MS = 10 * 60_000;
const GATEWAY_BACKGROUND_REMUX_STALL_TIMEOUT_MS = 30_000;
const MAX_HLS_VARIANTS_PER_JOB = 4;
export const GATEWAY_THUMBNAIL_BUCKET_SECONDS = 10;
export const GATEWAY_MAX_THUMBNAIL_BUCKET = 24 * 60 * 6;
const jobs = new Map<string, GatewayJob>();
type GatewayJobRuntime = { torrent: any };
const gatewayJobRuntimes = new Map<string, GatewayJobRuntime>();
const mediaProbeCache = createMediaProbeCache({
  ttlMs: 5 * 60_000,
  maxEntries: 16,
});
const subtitleDocumentCache = createMediaProbeCache({
  ttlMs: 5 * 60_000,
  maxEntries: 32,
});

function abortGatewayOperations(job: GatewayJob, reason: string) {
  for (const controller of job.operationAbortControllers) {
    controller.abort(new Error(reason));
  }
  job.operationAbortControllers.clear();
}

function releaseGatewaySeekableCache(
  job: GatewayJob,
  reason = "Gateway job cancelled",
) {
  job.seekableCacheAbortController?.abort(new Error(reason));
  job.seekableCacheAbortController = undefined;
  job.seekableCachePromise = undefined;
  job.releaseSeekableCache?.();
  job.releaseSeekableCache = undefined;

  if (
    job.seekableCacheStatus === "evaluating" ||
    job.seekableCacheStatus === "preparing"
  ) {
    // A cancelled/pruned job no longer has a usable handoff target. This does
    // not change the primary live playback state while the job is still live.
    job.seekableCacheStatus = "unavailable";
    job.seekableCacheUnavailableReason = "cancelled";
    job.seekableCacheCompletedAt = Date.now();
  }
}

function hasOtherActiveTorrentReference(job: GatewayJob) {
  if (!job.infoHash) return false;
  const infoHash = job.infoHash.toLowerCase();
  for (const other of jobs.values()) {
    if (other.id === job.id || other.infoHash?.toLowerCase() !== infoHash) {
      continue;
    }
    if (
      other.activeStreamCount > 0 ||
      !["error", "no_peers", "stalled", "cancelled", "expired"].includes(
        other.state,
      )
    ) {
      return true;
    }
  }
  return false;
}

function releaseGatewayJobRuntime(job: GatewayJob) {
  for (const session of job.hlsSessions?.values() ?? []) session.close();
  job.hlsSessions?.clear();
  for (const controller of job.hlsSessionAbortControllers?.values() ?? []) {
    controller.abort(new Error("Gateway HLS session released"));
  }
  job.hlsSessionAbortControllers?.clear();
  job.hlsSessionPromises?.clear();
  if (job.activeStreamCount > 0 || hasOtherActiveTorrentReference(job)) {
    return;
  }

  const runtime = gatewayJobRuntimes.get(job.id);
  gatewayJobRuntimes.delete(job.id);
  if (runtime?.torrent && job.infoHash) {
    void destroyTorrentByInfoHash(job.infoHash);
  }
}

function parseInfoHash(magnet: string) {
  const match = magnet.match(/btih:([^&]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : undefined;
}

function sanitizeGatewayError(err: unknown) {
  const message = String((err as Error | undefined)?.message ?? err);
  if (
    isTorrentEngineUnavailableError(err) ||
    /^torrent engine unavailable$/i.test(message.trim())
  ) {
    return "Torrent engine unavailable";
  }
  if (message.includes("Torrent peer discovery timeout")) {
    return "No peers found quickly enough to start this source.";
  }
  if (
    message.includes("Torrent ready timeout") ||
    message.includes("Torrent metadata timeout after peer connection")
  ) {
    return "Torrent metadata was not ready in time.";
  }
  if (message.includes("Torrent file first byte timeout")) {
    return "Torrent stalled while checking piece availability.";
  }
  if (/ffmpeg|remux|compatible stream|selected torrent file/i.test(message)) {
    return "A compatible stream could not be prepared.";
  }
  if (/preferred audio|english audio|audio track unavailable/i.test(message)) {
    return "The preferred audio track is unavailable for this source.";
  }
  return "Gateway job failed";
}

function getGatewayFailureCode(error: unknown): GatewayFailureCode {
  const message = String((error as Error | undefined)?.message ?? error);
  const code = (error as { code?: unknown } | undefined)?.code;
  if (code === "TRACKS_UNAVAILABLE") return "TRACKS_UNAVAILABLE";
  return isTorrentEngineUnavailableError(error) ||
    /^torrent engine unavailable$/i.test(message.trim())
    ? "RUNTIME_UNAVAILABLE"
    : "INTERNAL";
}

function getTorrentContainerCategory(filename: string) {
  const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "mkv") return "mkv";
  if (extension === "mp4" || extension === "m4v") return "mp4";
  if (extension === "webm") return "webm";
  if (extension === "mov") return "mov";
  return "other";
}

function isRetryableGatewayError(error: unknown) {
  const message = sanitizeGatewayError(error).toLowerCase();
  return (
    message.includes("peer") ||
    message.includes("timeout") ||
    message.includes("metadata") ||
    message.includes("stalled")
  );
}

function isNoPeersGatewayError(error: unknown) {
  const message = sanitizeGatewayError(error).toLowerCase();
  return message.includes("no peers") || message.includes("peer discovery");
}

function isStalledGatewayError(error: unknown) {
  const message = sanitizeGatewayError(error).toLowerCase();
  return (
    message.includes("stalled") ||
    message.includes("metadata was not ready") ||
    message.includes("torrent ready timeout")
  );
}

function shouldPruneJob(job: GatewayJob, now: number) {
  if (job.activeStreamCount > 0) return false;

  if (job.state === "ready") {
    const referenceTime = job.lastStreamAccessAt ?? job.updatedAt;
    const ttl = job.lastStreamAccessAt
      ? CONSUMED_READY_JOB_TTL_MS
      : UNUSED_READY_JOB_TTL_MS;
    return now - referenceTime > ttl;
  }

  const ttl =
    job.state === "error" ||
    job.state === "no_peers" ||
    job.state === "cancelled" ||
    job.state === "expired"
      ? TERMINAL_JOB_TTL_MS
      : JOB_TTL_MS;
  return now - job.updatedAt > ttl;
}

function pruneJobs(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (shouldPruneJob(job, now)) {
      if (job.progressTimer) clearInterval(job.progressTimer);
      abortGatewayOperations(job, "Gateway job expired");
      releaseGatewaySeekableCache(job, "Gateway job expired");
      releaseGatewayJobRuntime(job);
      jobs.delete(id);
    }
  }
}

const pruneTimer = setInterval(pruneJobs, JOB_PRUNE_INTERVAL_MS);
pruneTimer.unref?.();

function getJobPhase(job: GatewayJob): GatewayJobPhase {
  if (job.state === "no_peers") return "no_peers";
  if (job.state === "stalled") return "stalled";
  if (job.state === "ready") return "ready";
  if (job.state === "error") return "error";
  if (job.state === "cancelled") return "cancelled";
  if (job.state === "expired") return "expired";
  if (job.mode === "remux" && job.remuxStartedAt) return "remuxing";
  if (job.firstByteProbeStartedAt) return "checking_piece_availability";
  if (job.metadataReceivedAt) return "selecting_file";
  return (job.peerCount ?? 0) > 0 ? "preparing_metadata" : "finding_peers";
}

function getEffectiveJobState(job: GatewayJob): GatewayJobState {
  // Warmup owns its explicit peer, metadata, and first-byte failures. Do not
  // synthesize a terminal state from wall time while a probe can still resolve
  // on the same event-loop turn; that used to reject an otherwise ready source
  // just before the final status poll.
  return job.state;
}

function getJobProgress(job: GatewayJob) {
  const state = getEffectiveJobState(job);
  if (state === "ready") return 1;
  if (
    state === "error" ||
    state === "no_peers" ||
    state === "cancelled" ||
    state === "expired"
  )
    return null;
  // Gateway readiness is indeterminate until the torrent can actually play.
  // Do not turn elapsed preparation time into a fake media progress percentage.
  return null;
}

function getGatewayReadyTimeoutMs(job: GatewayJob) {
  if (job.mode === "remux" && job.remuxStrategy === "seekable-cache") {
    return GATEWAY_METADATA_TIMEOUT_MS + GATEWAY_REMUX_READY_TIMEOUT_MS;
  }
  // Direct torrent bridging, HLS, and progressive fMP4 remuxing only need verified
  // piece-zero readability before returning the player URL.
  return GATEWAY_METADATA_TIMEOUT_MS + GATEWAY_FIRST_BYTE_TIMEOUT_MS;
}

function getJobMediaMetadata(job: GatewayJob, state: GatewayJobState) {
  if (job.mode !== "remux") {
    return {
      remuxed: false,
      container: "unknown",
      seekable: true,
      cacheStatus: "not_applicable",
    };
  }

  if (job.remuxStrategy === "progressive-fmp4") {
    const terminal =
      state === "error" ||
      state === "cancelled" ||
      state === "expired" ||
      state === "no_peers" ||
      state === "stalled";
    const seekableCacheStatus: GatewaySeekableCacheStatus = terminal
      ? "unavailable"
      : (job.seekableCacheStatus ?? "not_started");

    return {
      remuxed: true,
      container: "mp4",
      // The original fragmented response stays non-seekable. A new consumer
      // may reuse the same signed route once the background cache has reached
      // this explicit ready state.
      seekable: state === "ready" && seekableCacheStatus === "ready",
      cacheStatus: terminal ? "unavailable" : "streaming",
      seekableCache: {
        status: seekableCacheStatus,
        unavailableReason:
          seekableCacheStatus === "unavailable"
            ? (job.seekableCacheUnavailableReason ?? "remux_failed")
            : null,
        startedAt: job.seekableCacheStartedAt
          ? new Date(job.seekableCacheStartedAt).toISOString()
          : null,
        completedAt: job.seekableCacheCompletedAt
          ? new Date(job.seekableCacheCompletedAt).toISOString()
          : null,
      },
    };
  }

  if (job.remuxStrategy === "hls") {
    return {
      remuxed: true,
      container: "mp4",
      seekable: state === "ready",
      cacheStatus: state === "ready" ? "ready" : "pending",
    };
  }

  return {
    remuxed: true,
    container: "mp4",
    seekable: job.remuxStrategy === "seekable-cache" && state === "ready",
    cacheStatus:
      state === "error" || state === "cancelled" || state === "expired"
        ? "unavailable"
        : state === "ready"
          ? "ready"
          : "pending",
  };
}

function serializeJob(job: GatewayJob) {
  const elapsedMs = Math.max(0, Date.now() - job.createdAt);
  const state = getEffectiveJobState(job);
  return {
    id: job.id,
    state,
    phase: state === "stalled" ? "stalled" : getJobPhase(job),
    mode: job.mode,
    infoHash: job.infoHash,
    fileIdx: job.fileIdx,
    error: job.error,
    retryable:
      job.retryable ??
      (state === "preparing" || state === "stalled" || state === "error"),
    peerCount: job.peerCount ?? null,
    activeStreamCount: job.activeStreamCount,
    lastStreamAccessAt: job.lastStreamAccessAt
      ? new Date(job.lastStreamAccessAt).toISOString()
      : null,
    progress: getJobProgress(job),
    elapsedMs,
    readyTimeoutMs: getGatewayReadyTimeoutMs(job),
    playbackUrl:
      state === "cancelled" || state === "no_peers" || state === "expired"
        ? null
        : createSignedGatewayStreamPath(job.id),
    metricsUrl: job.infoHash
      ? `/api/torrent/${encodeURIComponent(job.infoHash)}/metrics`
      : null,
    media: getJobMediaMetadata(job, state),
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
  };
}

function getBridgeDelivery(job: GatewayJob): BridgeDelivery {
  if (job.mode !== "remux") return "range-http";
  return job.remuxStrategy;
}

function getBridgeJobFailure(
  job: GatewayJob,
  state: GatewayJobState,
): BridgeV1Error | undefined {
  switch (state) {
    case "no_peers":
      return {
        code: "NO_PEERS",
        message: "No peers were available for this source.",
        retryable: true,
      };
    case "stalled":
      return {
        code: "SOURCE_STALLED",
        message: "The source stalled while preparing media.",
        retryable: true,
      };
    case "cancelled":
      return {
        code: "JOB_CANCELLED",
        message: "The bridge job was cancelled.",
        retryable: false,
      };
    case "expired":
      return {
        code: "JOB_EXPIRED",
        message: "The bridge job expired.",
        retryable: false,
      };
    case "error": {
      const code = job.failureCode ?? "INTERNAL";
      return {
        code,
        message:
          code === "RUNTIME_UNAVAILABLE"
            ? "The torrent runtime is unavailable."
            : code === "TRACKS_UNAVAILABLE"
              ? "The preferred audio track is unavailable for this source."
              : "The bridge could not prepare this source.",
        retryable: job.retryable ?? code === "INTERNAL",
      };
    }
    default:
      return undefined;
  }
}

export function serializeBridgeJobV1(job: GatewayJob) {
  const state = getEffectiveJobState(job);
  const phase = state === "stalled" ? "stalled" : getJobPhase(job);
  const delivery = getBridgeDelivery(job);
  const legacyMedia = getJobMediaMetadata(job, state);
  const terminal =
    state === "no_peers" ||
    state === "stalled" ||
    state === "error" ||
    state === "cancelled" ||
    state === "expired";
  const seek =
    terminal || state !== "ready"
      ? terminal
        ? ("unavailable" as const)
        : ("preparing" as const)
      : legacyMedia.seekable
        ? ("immediate" as const)
        : ("preparing" as const);
  const streamPath =
    state === "ready" ? createSignedBridgeV1StreamPath(job.id) : undefined;
  const expiresAt = streamPath
    ? Number(
        new URL(`http://bridge.invalid${streamPath}`).searchParams.get(
          "expires",
        ),
      )
    : undefined;

  const seekableCache =
    delivery === "progressive-fmp4"
      ? {
          status: legacyMedia.seekableCache?.status ?? "not_started",
          ...(legacyMedia.seekableCache?.status === "unavailable"
            ? {
                unavailableReason:
                  legacyMedia.seekableCache.unavailableReason ?? "remux_failed",
              }
            : {}),
        }
      : delivery === "seekable-cache"
        ? {
            status:
              state === "ready"
                ? ("ready" as const)
                : terminal
                  ? ("unavailable" as const)
                  : ("preparing" as const),
            ...(terminal
              ? {
                  unavailableReason:
                    state === "cancelled"
                      ? ("cancelled" as const)
                      : ("remux_failed" as const),
                }
              : {}),
          }
        : undefined;

  return bridgeJobResponseV1Schema.parse({
    protocolVersion: 1,
    job: {
      id: job.id,
      state,
      phase,
      delivery,
      peerCount: job.peerCount ?? null,
      readinessProgress: getJobProgress(job),
      elapsedMs: Math.max(0, Date.now() - job.createdAt),
      readyTimeoutMs: getGatewayReadyTimeoutMs(job),
      media: {
        container: legacyMedia.container,
        remuxed: legacyMedia.remuxed,
        seek,
        ...(seekableCache ? { seekableCache } : {}),
      },
      ...(streamPath && expiresAt
        ? {
            stream: {
              path: streamPath,
              expiresAt: new Date(expiresAt).toISOString(),
            },
          }
        : {}),
      ...(getBridgeJobFailure(job, state)
        ? { failure: getBridgeJobFailure(job, state) }
        : {}),
    },
  });
}

function getTerminalStreamResponse(job: GatewayJob) {
  if (isGatewayJobCancelled(job)) {
    return {
      status: 410,
      body: {
        error: job.error || "Gateway job cancelled",
        retryable: false,
        state: "cancelled",
      },
    };
  }

  if (job.state === "no_peers") {
    return {
      status: 503,
      body: {
        error: job.error || "No peers found for this torrent.",
        retryable: true,
        state: "no_peers",
      },
    };
  }

  if (getEffectiveJobState(job) === "stalled") {
    return {
      status: 504,
      body: {
        error: job.error || "Torrent stalled while preparing playback.",
        retryable: true,
        state: "stalled",
      },
    };
  }

  if (job.state === "expired") {
    return {
      status: 410,
      body: {
        error: job.error || "Gateway job expired.",
        retryable: false,
        state: "expired",
      },
    };
  }

  if (job.state === "error") {
    return {
      status: 503,
      body: {
        error: job.error || "Gateway job failed",
        retryable: job.retryable ?? true,
        state: "error",
      },
    };
  }

  return null;
}

function addGatewayJobBreadcrumb(
  job: GatewayJob,
  message: string,
  level: "debug" | "info" | "warning" | "error" = "info",
  data: Record<string, unknown> = {},
) {
  addStreamServerBreadcrumb({
    category: "gateway",
    message,
    level,
    data: {
      jobId: job.id,
      mode: job.mode,
      remuxStrategy: job.remuxStrategy,
      state: job.state,
      phase: getJobPhase(job),
      hasInfoHash: Boolean(job.infoHash),
      hasFileIdx: job.fileIdx !== undefined,
      hasHints: Boolean(job.hints),
      peerCount: job.peerCount,
      requestedDelivery: job.requestedDelivery,
      delivery: getBridgeDelivery(job),
      failureCode: job.failureCode,
      retryable: job.retryable,
      activeStreamCount: job.activeStreamCount,
      ...data,
    },
  });
}

function parsePositiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function parseFileSelectionHints(source: any): FileSelectionHints | undefined {
  const raw = source?.fileSelectionHints ?? source?.hints ?? source;
  const season = parsePositiveInteger(raw?.season);
  const episode = parsePositiveInteger(raw?.episode);
  const title =
    typeof raw?.title === "string" && raw.title.trim().length > 0
      ? raw.title.trim()
      : undefined;

  if (season === undefined && episode === undefined && title === undefined) {
    return undefined;
  }

  return { season, episode, title };
}

export function cancelGatewayJob(
  job: GatewayJob,
  error = "Gateway job cancelled",
) {
  if (job.progressTimer) {
    clearInterval(job.progressTimer);
    job.progressTimer = undefined;
  }
  job.abortController?.abort(new Error(error));
  job.abortController = undefined;
  abortGatewayOperations(job, error);
  releaseGatewaySeekableCache(job, error);
  for (const session of job.hlsSessions?.values() ?? []) session.close(error);
  job.hlsSessions?.clear();
  job.state = "cancelled";
  job.error = error;
  job.retryable = false;
  job.failureCode = undefined;
  job.updatedAt = Date.now();
  addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "warning");
  releaseGatewayJobRuntime(job);
}

function isGatewayJobCancelled(job: GatewayJob) {
  return job.state === "cancelled";
}

function markGatewayMetadataReceived(job: GatewayJob) {
  if (job.metadataReceivedAt) return;
  job.metadataReceivedAt = Date.now();
  job.updatedAt = job.metadataReceivedAt;
  addGatewayJobBreadcrumb(job, "gateway.metadata_received", "info");
}

function getRequestSignature(req: Request) {
  const raw = req.query.signature;
  if (Array.isArray(raw)) return String(raw[0] ?? "");
  return typeof raw === "string" ? raw : "";
}

function trackGatewayStream(job: GatewayJob, res: Response) {
  job.activeStreamCount += 1;
  job.lastStreamAccessAt = Date.now();
  job.updatedAt = Date.now();
  addGatewayJobBreadcrumb(job, "gateway.stream_consumer_attached", "info");

  let ended = false;
  const endTracking = () => {
    if (ended) return;
    ended = true;
    job.activeStreamCount = Math.max(0, job.activeStreamCount - 1);
    job.lastStreamAccessAt = Date.now();
    job.updatedAt = Date.now();
    if (
      ["error", "no_peers", "stalled", "cancelled", "expired"].includes(
        job.state,
      )
    ) {
      releaseGatewayJobRuntime(job);
    }
  };

  res.once("finish", endTracking);
  res.once("close", endTracking);
}

function trackGatewayJobProgress(job: GatewayJob, torrent: any) {
  const readPeerCount = () => {
    const count = Number(torrent?.numPeers);
    return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  };
  const recordPeerCount = () => {
    const peerCount = readPeerCount();
    const now = Date.now();
    job.peerCount = peerCount;
    if (
      job.lastPeerCountLogAt === undefined ||
      (now - job.lastPeerCountLogAt >= GATEWAY_PEER_LOG_INTERVAL_MS &&
        peerCount !== job.lastLoggedPeerCount)
    ) {
      const previousPeerCount = job.lastLoggedPeerCount;
      job.lastPeerCountLogAt = now;
      job.lastLoggedPeerCount = peerCount;
      addGatewayJobBreadcrumb(
        job,
        previousPeerCount === undefined
          ? "gateway.peer_count_observed"
          : "gateway.peer_count_changed",
        "debug",
        {
          previousPeerCount,
          peerCount,
          direction:
            previousPeerCount === undefined
              ? "initial"
              : peerCount > previousPeerCount
                ? "up"
                : peerCount < previousPeerCount
                  ? "down"
                  : "unchanged",
        },
      );
    }
  };

  recordPeerCount();
  job.progressTimer = setInterval(() => {
    if (job.state === "cancelled") {
      if (job.progressTimer) clearInterval(job.progressTimer);
      job.progressTimer = undefined;
      return;
    }
    recordPeerCount();
    job.updatedAt = Date.now();
  }, 1_000);

  return () => {
    if (job.progressTimer) clearInterval(job.progressTimer);
    job.progressTimer = undefined;
  };
}

/**
 * Primary Play starts with an fMP4 pipe because it gives the first frame much
 * sooner than a full `+faststart` pass. After the first real GET consumer is
 * attached, build exactly one seekable cache in the background. The remux
 * cache itself remains single-flight, so a concurrent compatibility, cast, or
 * retry request joins the same materialization instead of starting a second
 * FFmpeg cache job.
 */
function startGatewaySeekableCachePreparation(job: GatewayJob, torrent: any) {
  if (
    job.mode !== "remux" ||
    job.remuxStrategy !== "progressive-fmp4" ||
    job.state !== "ready" ||
    job.activeStreamCount <= 0 ||
    job.seekableCacheStatus === "preparing" ||
    job.seekableCacheStatus === "evaluating" ||
    job.seekableCacheStatus === "ready" ||
    job.seekableCacheStatus === "unavailable" ||
    isGatewayJobCancelled(job)
  ) {
    return;
  }

  const abortController = new AbortController();
  job.seekableCacheAbortController = abortController;
  job.seekableCacheStatus = "evaluating";
  job.seekableCacheStartedAt = Date.now();
  job.seekableCacheCompletedAt = undefined;
  job.seekableCacheUnavailableReason = undefined;
  job.seekableCacheBytesRead = 0;
  job.seekableCacheLastProgressAt = undefined;
  job.updatedAt = Date.now();
  addGatewayJobBreadcrumb(job, "gateway.seekable_cache_evaluating", "info", {
    seekableCacheStatus: "evaluating",
  });

  const ownsCurrentPreparation = () =>
    !isGatewayJobCancelled(job) &&
    job.seekableCacheAbortController === abortController &&
    (job.seekableCacheStatus === "evaluating" ||
      job.seekableCacheStatus === "preparing");

  job.seekableCachePromise = (async () => {
    const evaluation = await evaluateSeekableRemuxPreparation(torrent, {
      fileIdx: job.fileIdx,
      hints: job.hints,
    });
    if (!ownsCurrentPreparation()) return false;

    if (!evaluation.eligible) {
      job.seekableCacheStatus = "unavailable";
      job.seekableCacheUnavailableReason = evaluation.reason;
      job.seekableCacheCompletedAt = Date.now();
      job.updatedAt = Date.now();
      addGatewayJobBreadcrumb(
        job,
        "gateway.seekable_cache_unavailable",
        "warning",
        {
          seekableCacheStatus: "unavailable",
          unavailableReason: evaluation.reason,
        },
      );
      return false;
    }

    job.seekableCacheStatus = "preparing";
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.seekable_cache_started", "info", {
      seekableCacheStatus: "preparing",
    });

    await prepareSeekableRemux(torrent, {
      fileIdx: job.fileIdx,
      hints: job.hints,
      audioTrackId: job.audioTrackId,
      signal: abortController.signal,
      remuxTimeoutMs: GATEWAY_BACKGROUND_REMUX_TIMEOUT_MS,
      stallTimeoutMs: GATEWAY_BACKGROUND_REMUX_STALL_TIMEOUT_MS,
      onProgress: (bytesRead) => {
        if (!ownsCurrentPreparation()) return;
        const isFirstProgress = !job.seekableCacheLastProgressAt;
        job.seekableCacheBytesRead = bytesRead;
        job.seekableCacheLastProgressAt = Date.now();
        job.updatedAt = Date.now();
        if (isFirstProgress) {
          addGatewayJobBreadcrumb(
            job,
            "gateway.seekable_cache_progressed",
            "info",
            {
              elapsedMs:
                job.seekableCacheLastProgressAt -
                (job.seekableCacheStartedAt ?? job.createdAt),
            },
          );
        }
      },
    });
    return true;
  })()
    .then((prepared) => {
      if (!prepared) return;
      if (!ownsCurrentPreparation()) return;

      // Pin the completed entry until this job ends. A signed route is only
      // advertised as seekable while that exact cache remains available.
      const release = retainSeekableRemux(torrent, {
        fileIdx: job.fileIdx,
        hints: job.hints,
        audioTrackId: job.audioTrackId,
      });
      if (!release) {
        job.seekableCacheStatus = "unavailable";
        job.seekableCacheUnavailableReason = "remux_failed";
        job.seekableCacheCompletedAt = Date.now();
        job.updatedAt = Date.now();
        addGatewayJobBreadcrumb(
          job,
          "gateway.seekable_cache_unavailable",
          "warning",
          { seekableCacheStatus: "unavailable" },
        );
        return;
      }

      job.releaseSeekableCache = release;
      job.seekableCacheStatus = "ready";
      job.seekableCacheUnavailableReason = undefined;
      job.seekableCacheCompletedAt = Date.now();
      job.updatedAt = Date.now();
      addGatewayJobBreadcrumb(job, "gateway.seekable_cache_ready", "info", {
        seekableCacheStatus: "ready",
      });
    })
    .catch((error: unknown) => {
      // A seekable cache is an enhancement to the live response. Never turn a
      // healthy progressive playback job into a terminal failure just because
      // the optional handoff could not be produced.
      if (!ownsCurrentPreparation()) return;
      job.seekableCacheStatus = "unavailable";
      job.seekableCacheUnavailableReason = /timed out|timeout|stalled/i.test(
        String((error as Error | undefined)?.message ?? error),
      )
        ? "timed_out"
        : "remux_failed";
      job.seekableCacheCompletedAt = Date.now();
      job.updatedAt = Date.now();
      addGatewayJobBreadcrumb(
        job,
        "gateway.seekable_cache_unavailable",
        "warning",
        {
          seekableCacheStatus: "unavailable",
          unavailableReason: job.seekableCacheUnavailableReason,
        },
      );
    })
    .finally(() => {
      if (job.seekableCacheAbortController === abortController) {
        job.seekableCacheAbortController = undefined;
      }
      if (
        job.seekableCacheStatus !== "evaluating" &&
        job.seekableCacheStatus !== "preparing"
      ) {
        job.seekableCachePromise = undefined;
      }
    });
}

async function warmGatewayJob(job: GatewayJob, preparedTorrent?: any) {
  let stopProgressTracking: (() => void) | null = null;
  try {
    const torrent = preparedTorrent ?? (await prepareTorrent(job.magnet));
    gatewayJobRuntimes.set(job.id, { torrent });
    if (isGatewayJobCancelled(job)) return;

    job.infoHash = torrent.infoHash || job.infoHash;
    stopProgressTracking = trackGatewayJobProgress(job, torrent);
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");

    const metadataAbortController = new AbortController();
    job.abortController = metadataAbortController;
    addGatewayJobBreadcrumb(job, "gateway.metadata_wait_started", "info");
    try {
      await ensureTorrentReady(torrent, GATEWAY_METADATA_TIMEOUT_MS, {
        signal: metadataAbortController.signal,
        initialPeerTimeoutMs: GATEWAY_PEER_DISCOVERY_TIMEOUT_MS,
        metadataTimeoutAfterPeerMs: GATEWAY_METADATA_AFTER_PEER_TIMEOUT_MS,
        onMetadata: () => markGatewayMetadataReceived(job),
      });
    } finally {
      if (job.abortController === metadataAbortController) {
        job.abortController = undefined;
      }
    }
    if (isGatewayJobCancelled(job)) return;

    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;

    // Add-ons frequently omit the container from their stream label. The
    // actual selected file is authoritative: do not report a bridge job as
    // ready after its first byte if serving that file will later trigger a
    // full MKV -> MP4 remux. That used to hand the player a misleadingly
    // ready URL, then start an uncancelled remux only when the video element
    // requested it.
    const selectedFile = getSelectedFile(torrent, job.fileIdx, job.hints);
    const selectedFileIndex = torrent.files?.indexOf(selectedFile) ?? -1;
    if (selectedFileIndex < 0) {
      throw new Error("Selected torrent file is not part of the gateway job");
    }
    // Resolve hints once and make the resulting index authoritative for every
    // later stream, probe, subtitle, thumbnail, and handoff operation.
    job.fileIdx = selectedFileIndex;
    const selectedContainer = getTorrentContainerCategory(selectedFile.name);
    addGatewayJobBreadcrumb(job, "gateway.selected_container", "info", {
      selectedContainer,
    });

    // FFprobe is authoritative for Play audio, including sources whose
    // provider label says MP4 but whose default track is Spanish. A direct
    // range response can remain cheap only when its current default already
    // matches the required English main track.
    const audioTracksForSelection = await getGatewayTrackRows(job, torrent);
    const availableAudioTracks = audioTracksForSelection.tracks.filter(
      (track) => track.kind === "audio" && track.supported,
    );
    if (availableAudioTracks.length === 0) {
      throw new GatewayTracksUnavailableError();
    }
    const selectedAudioTrackId =
      selectPreferredAudioTrack(availableAudioTracks);
    if (!selectedAudioTrackId) {
      throw new GatewayTracksUnavailableError();
    }
    job.audioTrackId = selectedAudioTrackId;
    addGatewayJobBreadcrumb(job, "gateway.audio_track_selected", "info", {
      language: "en",
      selection: "preferred",
    });

    const sourceDefaultAudioTrack =
      availableAudioTracks.find((track) => track.default) ??
      availableAudioTracks[0];
    const directAudioIsCompatible =
      availableAudioTracks.length === 1 ||
      sourceDefaultAudioTrack?.id === selectedAudioTrackId;
    const needsContainerRemux = shouldRemuxTorrentFile(selectedFile.name);
    const needsAudioRemux = !directAudioIsCompatible;

    if (job.mode !== "remux" && (needsContainerRemux || needsAudioRemux)) {
      const previousDelivery = getBridgeDelivery(job);
      job.mode = "remux";
      job.remuxStrategy =
        job.requestedDelivery === "hls" ? "hls" : "progressive-fmp4";
      job.updatedAt = Date.now();
      addGatewayJobBreadcrumb(job, "gateway.delivery_promoted", "info", {
        fromDelivery: previousDelivery,
        toDelivery: job.remuxStrategy,
        selectedContainer,
      });
    }

    // Runtime probing can prove that a planner's unknown/mislabeled candidate
    // is already a browser-safe MP4. Do not pay for HLS/FFmpeg in that case;
    // only keep remuxing when it is still needed to select English audio.
    if (
      job.mode === "remux" &&
      selectedContainer === "mp4" &&
      !needsAudioRemux &&
      job.requestedDelivery !== "seekable-cache" &&
      job.remuxStrategy !== "seekable-cache"
    ) {
      const previousDelivery = getBridgeDelivery(job);
      job.mode = "bridge";
      job.updatedAt = Date.now();
      addGatewayJobBreadcrumb(job, "gateway.delivery_downgraded", "info", {
        fromDelivery: previousDelivery,
        toDelivery: "range-http",
        selectedContainer,
      });
    }

    if (job.mode === "remux") {
      job.remuxStartedAt = Date.now();
      job.retryable = true;
      job.updatedAt = Date.now();
      addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");

      const abortController = new AbortController();
      job.abortController = abortController;
      try {
        if (
          job.remuxStrategy === "progressive-fmp4" ||
          job.remuxStrategy === "hls"
        ) {
          const { tracks } = await getGatewayTrackRows(job, torrent);
          const availableAudioTracks = tracks.filter(
            (track) => track.kind === "audio" && track.supported,
          );
          if (availableAudioTracks.length === 0) {
            throw new GatewayTracksUnavailableError();
          }
          const selectedAudioTrackId =
            job.audioTrackId ?? selectPreferredAudioTrack(availableAudioTracks);
          if (!selectedAudioTrackId) {
            throw new GatewayTracksUnavailableError();
          }
          job.audioTrackId = selectedAudioTrackId;
          addGatewayJobBreadcrumb(job, "gateway.audio_track_selected", "info", {
            language: "en",
            selection: "preferred",
          });

          // Primary Play remuxes are fragmented MP4 streams. Proving the
          // first torrent byte is readable is the last preflight we need;
          // FFmpeg starts when the player connects, so we do not wait for the
          // whole movie just to relocate an MP4 index.
          job.firstByteProbeStartedAt = job.remuxStartedAt;
          addGatewayJobBreadcrumb(
            job,
            "gateway.first_byte_probe_started",
            "info",
          );
          const firstByte = await waitForTorrentFileFirstBytes(torrent, {
            fileIdx: job.fileIdx,
            hints: job.hints,
            signal: abortController.signal,
            timeoutMs: GATEWAY_FIRST_BYTE_TIMEOUT_MS,
          });
          addGatewayJobBreadcrumb(
            job,
            "gateway.first_byte_probe_ready",
            "info",
            {
              bytesRead: firstByte.bytesRead,
            },
          );
          if (job.remuxStrategy === "hls") {
            const session = await createHlsRemuxSession(selectedFile, {
              signal: abortController.signal,
              firstFragmentTimeoutMs: GATEWAY_FIRST_BYTE_TIMEOUT_MS,
              audioTrackId: job.audioTrackId,
              onFirstFragment: () => {
                addGatewayJobBreadcrumb(
                  job,
                  "gateway.first_fmp4_fragment",
                  "info",
                );
              },
            });
            job.hlsSessions = job.hlsSessions ?? new Map();
            job.hlsSessions.set(job.audioTrackId ?? "default", session);
            try {
              await session.waitUntilReady(abortController.signal);
              addGatewayJobBreadcrumb(
                job,
                "gateway.hls_manifest_ready",
                "info",
                {
                  ...session.getPublishedWindow(),
                },
              );
            } catch (error) {
              session.close();
              job.hlsSessions.delete(job.audioTrackId ?? "default");
              throw error;
            }
          }
        } else {
          await prepareSeekableRemux(torrent, {
            fileIdx: job.fileIdx,
            hints: job.hints,
            signal: abortController.signal,
            remuxTimeoutMs: GATEWAY_REMUX_READY_TIMEOUT_MS,
          });
          const release = retainSeekableRemux(torrent, {
            fileIdx: job.fileIdx,
            hints: job.hints,
          });
          if (!release) {
            throw new Error("Seekable cache could not be retained");
          }
          job.releaseSeekableCache = release;
        }
      } finally {
        if (job.abortController === abortController) {
          job.abortController = undefined;
        }
      }
      if (isGatewayJobCancelled(job)) return;
    } else {
      job.firstByteProbeStartedAt = Date.now();
      job.retryable = true;
      job.updatedAt = Date.now();
      addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");
      addGatewayJobBreadcrumb(job, "gateway.first_byte_probe_started", "info");

      const abortController = new AbortController();
      job.abortController = abortController;
      try {
        const firstByte = await waitForTorrentFileFirstBytes(torrent, {
          fileIdx: job.fileIdx,
          hints: job.hints,
          signal: abortController.signal,
          timeoutMs: GATEWAY_FIRST_BYTE_TIMEOUT_MS,
        });
        addGatewayJobBreadcrumb(job, "gateway.first_byte_probe_ready", "info", {
          bytesRead: firstByte.bytesRead,
        });
      } finally {
        if (job.abortController === abortController) {
          job.abortController = undefined;
        }
      }
      if (isGatewayJobCancelled(job)) return;
    }

    job.state = "ready";
    job.retryable = false;
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");
  } catch (err) {
    if (isGatewayJobCancelled(job)) return;
    job.error = sanitizeGatewayError(err);
    job.state = isNoPeersGatewayError(err)
      ? "no_peers"
      : isStalledGatewayError(err)
        ? "stalled"
        : "error";
    job.failureCode =
      job.state === "error" ? getGatewayFailureCode(err) : undefined;
    job.retryable =
      job.state === "error"
        ? job.failureCode === "INTERNAL"
        : isRetryableGatewayError(err);
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "error", {
      error: job.error,
    });
    releaseGatewayJobRuntime(job);
  } finally {
    stopProgressTracking?.();
  }
}

function parseJobRequest(req: Request) {
  const magnet = String(req.body?.magnet ?? "");
  if (!magnet.startsWith("magnet:?")) {
    return { error: "Magnet link is required" as const };
  }

  const fileIdx =
    typeof req.body?.fileIdx === "number" && Number.isInteger(req.body.fileIdx)
      ? req.body.fileIdx
      : undefined;
  const remux = req.body?.remux === "mp4" || req.body?.remuxFormat === "mp4";
  const remuxStrategy: GatewayRemuxStrategy =
    req.body?.remuxStrategy === "progressive-fmp4"
      ? "progressive-fmp4"
      : req.body?.remuxStrategy === "hls"
        ? "hls"
        : "seekable-cache";
  const hints = parseFileSelectionHints(req.body);

  return {
    magnet,
    fileIdx,
    hints,
    mode: remux ? ("remux" as const) : ("bridge" as const),
    remuxStrategy,
  };
}

export async function createGatewayJob(
  input: CreateGatewayJobInput,
): Promise<GatewayJob> {
  const job: GatewayJob = {
    id: randomUUID(),
    magnet: input.magnet,
    infoHash: parseInfoHash(input.magnet),
    fileIdx: input.fileIdx,
    hints: input.hints,
    mode: input.mode,
    remuxStrategy: input.remuxStrategy,
    requestedDelivery: input.requestedDelivery,
    state: "preparing",
    operationAbortControllers: new Set(),
    activeStreamCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  addGatewayJobBreadcrumb(job, "gateway.job_created", "info");
  addGatewayJobBreadcrumb(job, "gateway.delivery_requested", "info", {
    delivery: input.requestedDelivery ?? getBridgeDelivery(job),
  });

  try {
    const torrent = await prepareTorrent(job.magnet);
    gatewayJobRuntimes.set(job.id, { torrent });
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? 0;
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");
    void warmGatewayJob(job, torrent);
    return job;
  } catch (error) {
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "error", {
      error: sanitizeGatewayError(error),
    });
    gatewayJobRuntimes.delete(job.id);
    jobs.delete(job.id);
    throw error;
  }
}

export function getGatewayJob(jobId: string): GatewayJob | undefined {
  pruneJobs();
  return jobs.get(jobId);
}

export const gatewayRouter = Router();

gatewayRouter.post("/jobs", requireBridgeAuth, async (req, res) => {
  pruneJobs();

  const parsed = parseJobRequest(req);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const job = await createGatewayJob(parsed);

    return res.status(202).json(serializeJob(job));
  } catch (err) {
    return res.status(503).json({
      error: sanitizeGatewayError(err),
      retryable: false,
    });
  }
});

gatewayRouter.get(
  "/jobs/:id",
  requireBridgeAuth,
  (req: Request<{ id: string }>, res) => {
    pruneJobs();
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Gateway job not found" });
    return res.json(serializeJob(job));
  },
);

function subtitleFormatFromCodec(codec: string) {
  if (codec === "subrip" || codec === "srt") return "srt" as const;
  if (codec === "webvtt") return "vtt" as const;
  if (codec === "ass") return "ass" as const;
  if (codec === "ssa") return "ssa" as const;
  return "unknown" as const;
}

async function getGatewaySelectedMedia(job: GatewayJob, runtimeTorrent?: any) {
  if (
    (job.state !== "ready" && job.state !== "preparing") ||
    !Number.isInteger(job.fileIdx)
  ) {
    throw new Error("Gateway media is not ready");
  }
  const selectedFileIndex = job.fileIdx as number;

  const torrent = runtimeTorrent ?? (await prepareTorrent(job.magnet));
  if (isGatewayJobCancelled(job)) {
    throw new Error("Gateway job cancelled");
  }
  const selectedFile = getSelectedFile(torrent, selectedFileIndex);
  const client = await getClient();
  const address = client.server?.address?.();
  if (!address || typeof address === "string") {
    throw new Error("Torrent media server is unavailable");
  }
  const streamUrl = `http://127.0.0.1:${address.port}${selectedFile.streamURL}`;

  return {
    torrent,
    selectedFile,
    selectedFileIndex,
    streamUrl,
  };
}

async function getGatewayTrackRows(job: GatewayJob, runtimeTorrent?: any) {
  const { torrent, selectedFileIndex, streamUrl } =
    await getGatewaySelectedMedia(job, runtimeTorrent);
  const cacheKey = `${job.id}:${selectedFileIndex}`;
  const tracks = await mediaProbeCache.getOrCreate(cacheKey, async () => {
    const controller = new AbortController();
    job.operationAbortControllers.add(controller);
    try {
      return await probeMediaTracksAtUrl({
        streamUrl,
        signal: controller.signal,
      });
    } finally {
      job.operationAbortControllers.delete(controller);
    }
  });
  if (isGatewayJobCancelled(job)) {
    throw new Error("Gateway job cancelled");
  }

  return { torrent, selectedFileIndex, tracks };
}

export class GatewayTracksUnavailableError extends Error {
  readonly code = "TRACKS_UNAVAILABLE" as const;

  constructor() {
    super("Preferred audio track is unavailable for this source.");
    this.name = "GatewayTracksUnavailableError";
  }
}

export function selectPreferredAudioTrack(
  tracks: Array<{
    id: string;
    kind: string;
    language: string;
    title?: string;
    default: boolean;
    audioDescription: boolean;
    commentary: boolean;
    supported: boolean;
  }>,
) {
  const isEnglish = (track: { language: string; title?: string }) => {
    if (track.language.toLowerCase() === "en") return true;
    if (!track.title) return false;
    const title = track.title
      .toLowerCase()
      .replace(/[()[\],:_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!title.startsWith("english")) return false;
    if (
      /\b(commentary|descriptive|description|audio description)\b/.test(title)
    ) {
      return false;
    }
    return /^english(?:\s+(?:original|default|stereo|mono|aac|ac3|dts|atmos|\d(?:\.\d)?))*$/i.test(
      title,
    );
  };
  const audioTracks = tracks.filter(
    (track) => track.kind === "audio" && track.supported,
  );
  const englishMain = audioTracks.find(
    (track) => isEnglish(track) && !track.audioDescription && !track.commentary,
  );
  // Never silently fall through to commentary/descriptive or unknown audio.
  // The caller classifies an absent preferred track as TRACKS_UNAVAILABLE so
  // PlaybackSession can try another candidate.
  return englishMain?.id;
}

function preferredAudioTrackId(
  tracks: Array<{
    id: string;
    kind: string;
    language: string;
    default: boolean;
    audioDescription: boolean;
    commentary: boolean;
    supported: boolean;
  }>,
) {
  return selectPreferredAudioTrack(tracks);
}

function requestedAudioTrackId(req: Request) {
  const raw = Array.isArray(req.query.audioTrack)
    ? req.query.audioTrack[0]
    : req.query.audioTrack;
  if (raw === undefined) return { present: false as const, id: undefined };
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    return { present: true as const, id: undefined };
  }
  return { present: true as const, id: `audio:${raw}` };
}

function signedHlsSegmentQuery(req: Request) {
  const expires = Array.isArray(req.query.expires)
    ? req.query.expires[0]
    : req.query.expires;
  const signature = Array.isArray(req.query.signature)
    ? req.query.signature[0]
    : req.query.signature;
  if (typeof expires !== "string" || typeof signature !== "string") {
    return "";
  }
  const audio = requestedAudioTrackId(req);
  const audioQuery = audio.id
    ? `&audioTrack=${encodeURIComponent(audio.id.replace(/^audio:/, ""))}`
    : "";
  return `?expires=${encodeURIComponent(expires)}&signature=${encodeURIComponent(signature)}${audioQuery}`;
}

function rewriteHlsManifest(job: GatewayJob, req: Request, manifest: string) {
  const query = signedHlsSegmentQuery(req);
  if (!query) throw new Error("HLS stream signature is unavailable.");
  const segmentPath = (name: string) =>
    `/api/bridge/v1/jobs/${encodeURIComponent(job.id)}/segments/${encodeURIComponent(name)}${query}`;

  return manifest
    .split(/(\r?\n)/)
    .map((line) => {
      const trimmed = line.trim();
      if (HLS_MANIFEST_URI.test(trimmed)) {
        return line.replace(
          /URI="([^"]+)"/,
          (_match, name: string) => `URI="${segmentPath(name)}"`,
        );
      }
      if (trimmed && !trimmed.startsWith("#")) {
        return segmentPath(trimmed);
      }
      return line;
    })
    .join("");
}

const HLS_MANIFEST_URI = /URI="(?:init\.mp4|segment-\d{6}\.m4s)"/;

async function getOrCreateHlsSession(
  job: GatewayJob,
  torrent: any,
  audioTrackId: string | undefined,
  signal?: AbortSignal,
) {
  const key = audioTrackId ?? "default";
  job.hlsSessions = job.hlsSessions ?? new Map();
  const hlsSessions = job.hlsSessions;
  job.hlsSessionPromises = job.hlsSessionPromises ?? new Map();
  const existing = job.hlsSessions.get(key);
  if (existing) return existing;
  const inFlight = job.hlsSessionPromises.get(key);
  if (inFlight) return inFlight;
  if (
    job.hlsSessions.size + job.hlsSessionPromises.size >=
    MAX_HLS_VARIANTS_PER_JOB
  ) {
    throw new Error("Too many HLS audio variants are active for this job.");
  }

  const sessionAbortController = new AbortController();
  const abortFromCaller = () =>
    sessionAbortController.abort(
      signal?.reason ?? new Error("HLS session request cancelled"),
    );
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  job.hlsSessionAbortControllers = job.hlsSessionAbortControllers ?? new Map();
  job.hlsSessionAbortControllers.set(key, sessionAbortController);

  const creation = (async () => {
    const selectedFile = getSelectedFile(torrent, job.fileIdx, job.hints);
    const session = await createHlsRemuxSession(selectedFile, {
      signal: sessionAbortController.signal,
      audioTrackId,
      firstFragmentTimeoutMs: GATEWAY_FIRST_BYTE_TIMEOUT_MS,
      onFirstFragment: () => {
        addGatewayJobBreadcrumb(job, "gateway.first_fmp4_fragment", "info");
      },
    });
    try {
      await session.waitUntilReady(sessionAbortController.signal);
      if (isGatewayJobCancelled(job)) {
        session.close("Gateway job cancelled");
        throw new Error("Gateway HLS session was cancelled.");
      }
      // A successful audio replacement supersedes the previous variant. Keep
      // the old process alive until this one has a first fragment, then close
      // it so one player cannot accumulate FFmpeg jobs indefinitely.
      for (const [otherKey, otherSession] of hlsSessions) {
        if (otherKey === key) continue;
        otherSession.close("HLS audio variant replaced");
        hlsSessions.delete(otherKey);
      }
      hlsSessions.set(key, session);
      addGatewayJobBreadcrumb(job, "gateway.hls_manifest_ready", "info", {
        ...session.getPublishedWindow(),
      });
      return session;
    } catch (error) {
      session.close();
      throw error;
    }
  })();
  job.hlsSessionPromises.set(key, creation);
  try {
    return await creation;
  } finally {
    signal?.removeEventListener("abort", abortFromCaller);
    if (job.hlsSessionAbortControllers?.get(key) === sessionAbortController) {
      job.hlsSessionAbortControllers.delete(key);
    }
    if (job.hlsSessionPromises.get(key) === creation) {
      job.hlsSessionPromises.delete(key);
    }
  }
}

/**
 * Serves only the short-lived, job-owned HLS objects named by a rewritten
 * manifest. The signed stream URL remains the authority; segment names and
 * audio variants are validated again so a caller cannot turn this into a
 * filesystem or cross-job read primitive.
 */
export async function serveGatewayJobSegment(
  req: Request<{ id: string; segment: string }>,
  res: Response,
) {
  pruneJobs();
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Gateway job not found" });
  }

  const signature = validateGatewayStreamSignature(job.id, req.query, {
    lastStreamAccessAt: job.lastStreamAccessAt,
    activeSignature: job.activeStreamSignature,
  });
  if (!signature.ok) {
    return res.status(403).json({
      error:
        signature.reason === "expired"
          ? "Gateway stream URL expired"
          : "Gateway stream URL signature required",
    });
  }
  if (job.remuxStrategy !== "hls" || job.state !== "ready") {
    return res.status(404).json({ error: "HLS media is unavailable" });
  }

  const requestedAudio = requestedAudioTrackId(req);
  if (requestedAudio.present && !requestedAudio.id) {
    return res
      .status(400)
      .json({ error: "The requested audio track is invalid." });
  }
  const audioTrackId = requestedAudio.id ?? job.audioTrackId;
  const runtime = gatewayJobRuntimes.get(job.id);
  if (!runtime?.torrent) {
    return res.status(503).json({
      error: "The stream runtime is unavailable.",
      retryable: true,
    });
  }

  try {
    if (audioTrackId) {
      const { tracks } = await getGatewayTrackRows(job, runtime.torrent);
      const audioTrackExists = tracks.some(
        (track) =>
          track.kind === "audio" &&
          track.supported &&
          track.id === audioTrackId,
      );
      if (!audioTrackExists) {
        return res.status(404).json({
          error: "The requested HLS audio variant is unavailable.",
          retryable: false,
        });
      }
    }
    const session = await getOrCreateHlsSession(
      job,
      runtime.torrent,
      audioTrackId,
    );
    const segmentName = decodeURIComponent(req.params.segment);
    const bytes = await session.readSegment(segmentName);
    job.lastStreamAccessAt = Date.now();
    job.updatedAt = job.lastStreamAccessAt;
    res.set({
      "Content-Type":
        segmentName === "init.mp4" ? "video/mp4" : "video/iso.segment",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "Accept-Ranges": "none",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    });
    return res.status(200).send(bytes);
  } catch {
    if (getGatewayJob(job.id)?.state === "cancelled") {
      return res.status(410).json({
        error: "The bridge job was cancelled.",
        retryable: false,
      });
    }
    return res.status(404).json({
      error: "The requested HLS segment is unavailable.",
      retryable: true,
    });
  }
}

export async function buildGatewayTrackCatalog(job: GatewayJob) {
  const {
    torrent,
    selectedFileIndex,
    tracks: probedTracks,
  } = await getGatewayTrackRows(job);
  const effectiveAudioTrackId =
    job.audioTrackId ?? preferredAudioTrackId(probedTracks);
  const tracks = probedTracks.map((track) =>
    track.kind === "audio" && track.supported
      ? { ...track, default: track.id === effectiveAudioTrackId }
      : track,
  );

  const externalSubtitles = discoverExternalSubtitleCandidates(
    torrent.files || [],
    selectedFileIndex,
  );
  const embeddedSubtitles: SubtitleCandidate[] = tracks
    .filter((track) => track.kind === "subtitle" && track.supported)
    .map((track) => ({
      id: `embedded:${track.streamIndex}`,
      language: track.language,
      format: subtitleFormatFromCodec(track.codec),
      source: "embedded",
      label: track.title || `${track.language.toUpperCase()} · Embedded`,
      hearingImpaired: track.hearingImpaired,
      forced: track.forced,
      fileHashMatch: true,
      fileNameMatch: true,
      contentIdMatch: false,
      confidence: 0.95,
      active: false,
      fetchIdentity: `embedded:${track.streamIndex}`,
    }));

  return gatewayTrackCatalogSchema.parse({
    jobId: job.id,
    selectedFileIndex,
    tracks,
    subtitles: [...embeddedSubtitles, ...externalSubtitles],
  });
}

gatewayRouter.get(
  "/jobs/:id/tracks",
  requireBridgeAuth,
  async (req: Request<{ id: string }>, res) => {
    pruneJobs();
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Gateway job not found" });

    try {
      return res.json(await buildGatewayTrackCatalog(job));
    } catch (error) {
      if (isGatewayJobCancelled(job)) {
        return res.status(410).json({ error: "Gateway job cancelled" });
      }
      return res.status(503).json({
        error: "Media tracks are temporarily unavailable",
        retryable: true,
      });
    }
  },
);

export function gatewayJobOwnsSeekableCache(job: GatewayJob): boolean {
  return (
    job.state === "ready" &&
    job.mode === "remux" &&
    Boolean(job.releaseSeekableCache) &&
    (job.remuxStrategy === "seekable-cache" ||
      job.seekableCacheStatus === "ready")
  );
}

export async function getGatewayThumbnail(
  job: GatewayJob,
  bucket: number,
  signal?: AbortSignal,
): Promise<Buffer | undefined> {
  const torrent = await prepareTorrent(job.magnet);
  if (isGatewayJobCancelled(job)) {
    throw new Error("Gateway job cancelled");
  }
  const source = getRetainedSeekableRemuxSource(torrent, {
    fileIdx: job.fileIdx,
    hints: job.hints,
    audioTrackId: job.audioTrackId,
  });
  if (!source) return undefined;

  return seekThumbnailService.getOrCreate({
    cacheKey: source.cacheKey,
    filePath: source.filePath,
    timeSeconds: bucket * GATEWAY_THUMBNAIL_BUCKET_SECONDS,
    signal,
  });
}

gatewayRouter.get(
  "/jobs/:id/thumbnails/:bucket",
  requireBridgeAuth,
  async (req: Request<{ id: string; bucket: string }>, res) => {
    pruneJobs();
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Gateway job not found" });
    if (isGatewayJobCancelled(job)) {
      return res.status(410).json({ error: "Gateway job cancelled" });
    }

    const bucketText = req.params.bucket;
    const bucket = /^\d+$/.test(bucketText) ? Number(bucketText) : NaN;
    if (
      !Number.isSafeInteger(bucket) ||
      bucket < 0 ||
      bucket > GATEWAY_MAX_THUMBNAIL_BUCKET
    ) {
      return res.status(400).json({ error: "Invalid thumbnail bucket" });
    }

    const ownsSeekableCache = gatewayJobOwnsSeekableCache(job);
    if (!ownsSeekableCache) {
      return res.status(425).json({
        error: "Seekable media is still preparing",
        retryable: true,
      });
    }

    const abortController = new AbortController();
    job.operationAbortControllers.add(abortController);
    let responseReady = false;
    const abortOnDisconnect = () => {
      if (!responseReady) {
        abortController.abort(new Error("Thumbnail request cancelled"));
      }
    };
    req.once("aborted", abortOnDisconnect);
    res.once("close", abortOnDisconnect);

    try {
      const thumbnail = await getGatewayThumbnail(
        job,
        bucket,
        abortController.signal,
      );
      if (!thumbnail) {
        return res.status(425).json({
          error: "Seekable media is still preparing",
          retryable: true,
        });
      }
      if (isGatewayJobCancelled(job)) {
        return res.status(410).json({ error: "Gateway job cancelled" });
      }

      responseReady = true;
      res.set({
        "Cache-Control": "no-store",
        "Content-Length": String(thumbnail.length),
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
      });
      return res.status(200).send(thumbnail);
    } catch {
      if (res.destroyed) return;
      if (isGatewayJobCancelled(job)) {
        return res.status(410).json({ error: "Gateway job cancelled" });
      }
      return res.status(503).json({
        error: "Thumbnail is temporarily unavailable",
        retryable: true,
      });
    } finally {
      responseReady = true;
      req.off("aborted", abortOnDisconnect);
      res.off("close", abortOnDisconnect);
      job.operationAbortControllers.delete(abortController);
    }
  },
);

function isNormalizableSubtitleFormat(
  value: string,
): value is "srt" | "vtt" | "ass" | "ssa" {
  return (
    value === "srt" || value === "vtt" || value === "ass" || value === "ssa"
  );
}

export async function getGatewaySubtitleDocument(
  job: GatewayJob,
  identity: string,
): Promise<string | undefined> {
  const identityMatch = identity.match(/^(external|embedded):(\d+)$/);
  if (!identityMatch) return undefined;

  const catalog = await buildGatewayTrackCatalog(job);
  const candidate = catalog.subtitles.find(
    (subtitle) => subtitle.fetchIdentity === identity,
  );
  if (!candidate) return undefined;

  return subtitleDocumentCache.getOrCreate(
    `${job.id}:${identity}`,
    async () => {
      const controller = new AbortController();
      job.operationAbortControllers.add(controller);
      try {
        const { torrent, streamUrl } = await getGatewaySelectedMedia(job);
        const sourceIndex = Number(identityMatch[2]);

        if (
          identityMatch[1] === "external" &&
          candidate.source === "torrent-file" &&
          isNormalizableSubtitleFormat(candidate.format)
        ) {
          const subtitleFile = torrent.files?.[sourceIndex];
          if (!subtitleFile) {
            throw new Error("Subtitle file is unavailable");
          }
          const buffer = await readTorrentSubtitleBuffer(
            subtitleFile,
            controller.signal,
          );
          return normalizeSubtitleBuffer(buffer, candidate.format);
        }

        if (
          identityMatch[1] === "embedded" &&
          candidate.source === "embedded"
        ) {
          return await extractEmbeddedSubtitleToVtt({
            streamUrl,
            streamIndex: sourceIndex,
            signal: controller.signal,
          });
        }

        throw new Error("Subtitle identity does not match its source");
      } finally {
        job.operationAbortControllers.delete(controller);
      }
    },
  );
}

gatewayRouter.get(
  "/jobs/:id/subtitles/:identity",
  requireBridgeAuth,
  async (req: Request<{ id: string; identity: string }>, res) => {
    pruneJobs();
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Gateway job not found" });
    if (isGatewayJobCancelled(job)) {
      return res.status(410).json({ error: "Gateway job cancelled" });
    }
    if (job.state !== "ready") {
      return res.status(425).json({
        error: "Gateway media is still preparing",
        retryable: true,
      });
    }

    try {
      const document = await getGatewaySubtitleDocument(
        job,
        req.params.identity,
      );
      if (!document) {
        return res.status(404).json({ error: "Subtitle not found" });
      }

      if (isGatewayJobCancelled(job)) {
        return res.status(410).json({ error: "Gateway job cancelled" });
      }
      res.set("Content-Type", "text/vtt; charset=utf-8");
      res.set("Cache-Control", "no-store");
      return res.send(document);
    } catch {
      if (isGatewayJobCancelled(job)) {
        return res.status(410).json({ error: "Gateway job cancelled" });
      }
      return res.status(503).json({
        error: "Subtitle is temporarily unavailable",
        retryable: true,
      });
    }
  },
);

gatewayRouter.delete(
  "/jobs/:id",
  requireBridgeAuth,
  (req: Request<{ id: string }>, res) => {
    pruneJobs();
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Gateway job not found" });

    cancelGatewayJob(job);
    return res.status(202).json(serializeJob(job));
  },
);

export async function serveGatewayJobStream(
  req: Request<{ id: string }>,
  res: Response,
) {
  pruneJobs();
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Gateway job not found" });

  const signature = validateGatewayStreamSignature(req.params.id, req.query, {
    lastStreamAccessAt: job.lastStreamAccessAt,
    activeSignature: job.activeStreamSignature,
  });
  if (!signature.ok) {
    return res.status(403).json({
      error:
        signature.reason === "expired"
          ? "Gateway stream URL expired"
          : "Gateway stream URL signature required",
    });
  }

  job.activeStreamSignature = getRequestSignature(req);

  const terminalResponse = getTerminalStreamResponse(job);
  if (terminalResponse) {
    return res.status(terminalResponse.status).json(terminalResponse.body);
  }
  // The job preflight owns metadata, first-byte, and remux readiness. Serving
  // a bridge job while that work is still pending used to create a second,
  // uncancellable metadata wait. The player already polls this job, so make
  // every mode wait for its single authoritative ready transition.
  if (job.state !== "ready") {
    return res.status(425).json({
      error:
        job.mode === "remux"
          ? "Gateway remux is still preparing."
          : "Gateway source is still preparing.",
      retryable: true,
    });
  }

  const audioSelection = requestedAudioTrackId(req);
  if (audioSelection.present && !audioSelection.id) {
    return res.status(400).json({
      error: "The requested audio track is invalid.",
      retryable: false,
    });
  }

  trackGatewayStream(job, res);

  try {
    let torrent = gatewayJobRuntimes.get(job.id)?.torrent;
    if (!torrent) {
      // This is only a compatibility path for jobs created outside the normal
      // owner. A ready job created through the API always reuses the runtime
      // that performed its metadata/first-byte preflight above.
      const readinessAbortController = new AbortController();
      job.abortController = readinessAbortController;
      try {
        torrent = await prepareTorrent(job.magnet);
        gatewayJobRuntimes.set(job.id, { torrent });
        if (isGatewayJobCancelled(job)) {
          return res.status(410).json({
            error: job.error || "Gateway job cancelled",
            retryable: false,
          });
        }
        job.infoHash = torrent.infoHash || job.infoHash;
        job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;
        job.updatedAt = Date.now();

        await ensureTorrentReady(torrent, GATEWAY_METADATA_TIMEOUT_MS, {
          signal: readinessAbortController.signal,
          initialPeerTimeoutMs: GATEWAY_PEER_DISCOVERY_TIMEOUT_MS,
          metadataTimeoutAfterPeerMs: GATEWAY_METADATA_AFTER_PEER_TIMEOUT_MS,
          onMetadata: () => markGatewayMetadataReceived(job),
        });
      } finally {
        if (job.abortController === readinessAbortController) {
          job.abortController = undefined;
        }
      }
    }
    if (isGatewayJobCancelled(job)) {
      return res.status(410).json({
        error: job.error || "Gateway job cancelled",
        retryable: false,
      });
    }

    let audioTrackId = audioSelection.id;
    if (
      job.mode === "remux" &&
      (job.remuxStrategy === "progressive-fmp4" || job.remuxStrategy === "hls")
    ) {
      try {
        const { tracks } = await getGatewayTrackRows(job, torrent);
        const availableAudioTracks = tracks.filter(
          (track) => track.kind === "audio" && track.supported,
        );
        if (
          audioTrackId &&
          !availableAudioTracks.some((track) => track.id === audioTrackId)
        ) {
          return res.status(400).json({
            error: "The requested audio track is unavailable.",
            retryable: false,
          });
        }

        if (!audioTrackId && availableAudioTracks.length === 0) {
          throw new GatewayTracksUnavailableError();
        }

        if (!audioTrackId && !job.audioTrackId) {
          job.audioTrackId = selectPreferredAudioTrack(availableAudioTracks);
          if (!job.audioTrackId) {
            throw new GatewayTracksUnavailableError();
          }
          const selectedTrack = availableAudioTracks.find(
            (track) => track.id === job.audioTrackId,
          );
          addGatewayJobBreadcrumb(job, "gateway.audio_track_selected", "info", {
            language: selectedTrack?.language,
            selection: selectedTrack ? "preferred" : "source-default",
          });
        }
        audioTrackId = audioTrackId ?? job.audioTrackId;
      } catch (error) {
        if (error instanceof GatewayTracksUnavailableError) throw error;
        // Track probing is required for the English-audio policy. A probe
        // failure is a candidate-local INTERNAL error, not permission to
        // start an unverified default (which could be Spanish).
        addGatewayJobBreadcrumb(
          job,
          "gateway.audio_track_selection_unavailable",
          "warning",
          { reason: "probe_failed" },
        );
        throw error;
      }
    }
    if (job.mode === "remux") {
      if (job.remuxStrategy === "hls") {
        const hlsSession = await getOrCreateHlsSession(
          job,
          torrent,
          audioTrackId ?? job.audioTrackId,
        );
        const manifest = await hlsSession.readManifest();
        res.set({
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Content-Type",
        });
        return res.status(200).send(rewriteHlsManifest(job, req, manifest));
      }

      const abortController = new AbortController();
      job.abortController = abortController;

      try {
        const serveSeekableCache =
          job.remuxStrategy === "progressive-fmp4" &&
          !audioSelection.id &&
          job.seekableCacheStatus === "ready";
        const serving = serveTorrentFile(req, res, torrent, {
          fileIdx: job.fileIdx,
          hints: job.hints,
          remuxFormat: "mp4",
          // A player handoff opens the same signed URL again (normally with a
          // non-zero range). Once the optional cache is ready, make that
          // representation seekable without minting or exposing another URL.
          remuxStrategy: serveSeekableCache
            ? "seekable-cache"
            : job.remuxStrategy,
          signal: abortController.signal,
          remuxTimeoutMs: GATEWAY_FIRST_BYTE_TIMEOUT_MS,
          onFirstFragment: () => {
            addGatewayJobBreadcrumb(job, "gateway.first_fmp4_fragment", "info");
          },
          onError: (error) => {
            if (isGatewayJobCancelled(job)) return;
            job.state = "error";
            job.error = sanitizeGatewayError(error);
            job.failureCode = getGatewayFailureCode(error);
            job.retryable = job.failureCode === "INTERNAL";
            job.updatedAt = Date.now();
            addGatewayJobBreadcrumb(
              job,
              "gateway.progressive_remux_failed",
              "error",
              { error: job.error },
            );
          },
          audioTrackId,
        });
        // Do not spend CPU/disk on a cache while a job merely warms. A real
        // GET consumer has now been counted by `trackGatewayStream`; start one
        // background cache only after the live delivery has been accepted.
        if (req.method === "GET" && !serveSeekableCache) {
          addGatewayJobBreadcrumb(
            job,
            "gateway.cache_handoff_started",
            "info",
            {
              handoff: "background-seekable-cache",
            },
          );
          startGatewaySeekableCachePreparation(job, torrent);
        }
        const result = await serving;
        const stateAfterServing = getEffectiveJobState(job);
        if (
          !isGatewayJobCancelled(job) &&
          stateAfterServing !== "error" &&
          res.statusCode < 400
        ) {
          job.state = "ready";
          job.retryable = false;
          addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");
        } else if (
          !isGatewayJobCancelled(job) &&
          (stateAfterServing === "error" || res.statusCode >= 400)
        ) {
          releaseGatewaySeekableCache(job, "Primary playback stream failed");
          if (stateAfterServing !== "error") {
            job.state = "error";
            job.error = "A compatible stream could not be prepared.";
            job.retryable = true;
            job.failureCode = "INTERNAL";
            addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "error", {
              error: job.error,
            });
          }
        }
        job.updatedAt = Date.now();
        return result;
      } finally {
        if (job.abortController === abortController) {
          job.abortController = undefined;
        }
      }
    }

    job.state = "ready";
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;
    job.retryable = false;
    job.failureCode = undefined;
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");

    return serveTorrentFile(req, res, torrent, {
      fileIdx: job.fileIdx,
      hints: job.hints,
      audioTrackId: job.audioTrackId,
    });
  } catch (err) {
    const terminalResponse = getTerminalStreamResponse(job);
    if (terminalResponse) {
      if (!res.headersSent) {
        return res.status(terminalResponse.status).json(terminalResponse.body);
      }
      return;
    }
    const error = sanitizeGatewayError(err);
    releaseGatewaySeekableCache(job, "Primary playback stream failed");
    job.state = "error";
    job.error = error;
    job.failureCode = getGatewayFailureCode(err);
    job.retryable =
      job.failureCode === "INTERNAL" || isRetryableGatewayError(err);
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "error", {
      error,
    });
    if (!res.headersSent) {
      return res.status(503).json({ error, retryable: job.retryable });
    }
  }
}

gatewayRouter.get("/jobs/:id/stream", serveGatewayJobStream);

export function __resetGatewayJobsForTests() {
  for (const job of jobs.values()) {
    if (job.progressTimer) clearInterval(job.progressTimer);
    abortGatewayOperations(job, "Gateway jobs reset for tests");
    releaseGatewaySeekableCache(job, "Gateway jobs reset for tests");
    for (const session of job.hlsSessions?.values() ?? []) {
      session.close("Gateway jobs reset for tests");
    }
    job.hlsSessions?.clear();
    job.activeStreamCount = 0;
    releaseGatewayJobRuntime(job);
  }
  jobs.clear();
  gatewayJobRuntimes.clear();
  mediaProbeCache.clear();
  subtitleDocumentCache.clear();
  seekThumbnailService.clear();
}

export function __pruneGatewayJobsForTests(now: number) {
  pruneJobs(now);
}
