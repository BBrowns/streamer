import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import {
  createSignedGatewayStreamPath,
  requireBridgeAuth,
  validateGatewayStreamSignature,
} from "./security.js";
import {
  ensureTorrentReady,
  getSelectedFile,
  isTorrentEngineUnavailableError,
  prepareSeekableRemux,
  prepareTorrent,
  serveTorrentFile,
  shouldRemuxTorrentFile,
  waitForTorrentFileFirstBytes,
  destroyTorrentByInfoHash,
} from "./torrent.js";
import type { FileSelectionHints } from "./torrent.js";
import { addStreamServerBreadcrumb } from "./sentry.js";

type GatewayJobState =
  | "preparing"
  | "ready"
  | "no_peers"
  | "stalled"
  | "error"
  | "cancelled"
  | "expired";
type GatewayJobMode = "bridge" | "remux";
type GatewayRemuxStrategy = "seekable-cache" | "progressive-fmp4";
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

interface GatewayJob {
  id: string;
  magnet: string;
  infoHash?: string;
  fileIdx?: number;
  hints?: FileSelectionHints;
  mode: GatewayJobMode;
  remuxStrategy: GatewayRemuxStrategy;
  state: GatewayJobState;
  error?: string;
  peerCount?: number;
  retryable?: boolean;
  progressTimer?: ReturnType<typeof setInterval>;
  abortController?: AbortController;
  firstByteProbeStartedAt?: number;
  remuxStartedAt?: number;
  activeStreamCount: number;
  activeStreamSignature?: string;
  lastStreamAccessAt?: number;
  createdAt: number;
  updatedAt: number;
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
const GATEWAY_REMUX_READY_TIMEOUT_MS = 60_000;
const jobs = new Map<string, GatewayJob>();

function parseInfoHash(magnet: string) {
  const match = magnet.match(/btih:([^&]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : undefined;
}

function sanitizeGatewayError(err: unknown) {
  const message = String((err as Error | undefined)?.message ?? err);
  if (isTorrentEngineUnavailableError(err)) return message;
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
  return message || "Gateway job failed";
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
  // Direct torrent bridging and progressive fMP4 remuxing only need verified
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

  return {
    remuxed: true,
    container: "mp4",
    seekable: job.remuxStrategy === "seekable-cache" && state === "ready",
    cacheStatus:
      state === "error" || state === "cancelled" || state === "expired"
        ? "unavailable"
        : job.remuxStrategy === "progressive-fmp4"
          ? "streaming"
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
        retryable: true,
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

function cancelGatewayJob(job: GatewayJob, error = "Gateway job cancelled") {
  if (job.progressTimer) {
    clearInterval(job.progressTimer);
    job.progressTimer = undefined;
  }
  job.abortController?.abort(new Error(error));
  job.abortController = undefined;
  job.state = "cancelled";
  job.error = error;
  job.retryable = false;
  job.updatedAt = Date.now();
  addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "warning");
  if (job.activeStreamCount === 0) {
    void destroyTorrentByInfoHash(job.infoHash);
  }
}

function isGatewayJobCancelled(job: GatewayJob) {
  return job.state === "cancelled";
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

  let ended = false;
  const endTracking = () => {
    if (ended) return;
    ended = true;
    job.activeStreamCount = Math.max(0, job.activeStreamCount - 1);
    job.lastStreamAccessAt = Date.now();
    job.updatedAt = Date.now();
  };

  res.once("finish", endTracking);
  res.once("close", endTracking);
}

function trackGatewayJobProgress(job: GatewayJob, torrent: any) {
  job.peerCount = torrent?.numPeers ?? 0;
  job.progressTimer = setInterval(() => {
    if (job.state === "cancelled") {
      if (job.progressTimer) clearInterval(job.progressTimer);
      job.progressTimer = undefined;
      return;
    }
    job.peerCount = torrent?.numPeers ?? job.peerCount ?? 0;
    job.updatedAt = Date.now();
  }, 1_000);

  return () => {
    if (job.progressTimer) clearInterval(job.progressTimer);
    job.progressTimer = undefined;
  };
}

async function warmGatewayJob(job: GatewayJob, preparedTorrent?: any) {
  let stopProgressTracking: (() => void) | null = null;
  try {
    const torrent = preparedTorrent ?? (await prepareTorrent(job.magnet));
    if (isGatewayJobCancelled(job)) return;

    job.infoHash = torrent.infoHash || job.infoHash;
    stopProgressTracking = trackGatewayJobProgress(job, torrent);
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");

    const metadataAbortController = new AbortController();
    job.abortController = metadataAbortController;
    try {
      await ensureTorrentReady(torrent, GATEWAY_METADATA_TIMEOUT_MS, {
        signal: metadataAbortController.signal,
        initialPeerTimeoutMs: GATEWAY_PEER_DISCOVERY_TIMEOUT_MS,
        metadataTimeoutAfterPeerMs: GATEWAY_METADATA_AFTER_PEER_TIMEOUT_MS,
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
    if (job.mode !== "remux" && shouldRemuxTorrentFile(selectedFile.name)) {
      job.mode = "remux";
      job.updatedAt = Date.now();
      addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info", {
        remuxDetectedFromSelectedFile: true,
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
        if (job.remuxStrategy === "progressive-fmp4") {
          // Primary Play remuxes are fragmented MP4 streams. Proving the
          // first torrent byte is readable is the last preflight we need;
          // FFmpeg starts when the player connects, so we do not wait for the
          // whole movie just to relocate an MP4 index.
          job.firstByteProbeStartedAt = job.remuxStartedAt;
          await waitForTorrentFileFirstBytes(torrent, {
            fileIdx: job.fileIdx,
            hints: job.hints,
            signal: abortController.signal,
            timeoutMs: GATEWAY_FIRST_BYTE_TIMEOUT_MS,
          });
        } else {
          await prepareSeekableRemux(torrent, {
            fileIdx: job.fileIdx,
            hints: job.hints,
            signal: abortController.signal,
            remuxTimeoutMs: GATEWAY_REMUX_READY_TIMEOUT_MS,
          });
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

      const abortController = new AbortController();
      job.abortController = abortController;
      try {
        await waitForTorrentFileFirstBytes(torrent, {
          fileIdx: job.fileIdx,
          hints: job.hints,
          signal: abortController.signal,
          timeoutMs: GATEWAY_FIRST_BYTE_TIMEOUT_MS,
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
    job.retryable = isRetryableGatewayError(err);
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "error", {
      error: job.error,
    });
    if (job.state === "no_peers" || job.state === "stalled") {
      void destroyTorrentByInfoHash(job.infoHash);
    }
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

export const gatewayRouter = Router();

gatewayRouter.post("/jobs", requireBridgeAuth, async (req, res) => {
  pruneJobs();

  const parsed = parseJobRequest(req);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  const job: GatewayJob = {
    id: randomUUID(),
    magnet: parsed.magnet,
    infoHash: parseInfoHash(parsed.magnet),
    fileIdx: parsed.fileIdx,
    hints: parsed.hints,
    mode: parsed.mode,
    remuxStrategy: parsed.remuxStrategy,
    state: "preparing",
    activeStreamCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  addGatewayJobBreadcrumb(job, "gateway.job_created", "info");

  try {
    const torrent = await prepareTorrent(job.magnet);
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? 0;
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");
    void warmGatewayJob(job, torrent);

    return res.status(202).json(serializeJob(job));
  } catch (err) {
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "error", {
      error: sanitizeGatewayError(err),
    });
    jobs.delete(job.id);
    return res.status(503).json({
      error: sanitizeGatewayError(err),
      retryable: false,
    });
  }
});

gatewayRouter.get("/jobs/:id", requireBridgeAuth, (req, res) => {
  pruneJobs();
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Gateway job not found" });
  return res.json(serializeJob(job));
});

gatewayRouter.delete("/jobs/:id", requireBridgeAuth, (req, res) => {
  pruneJobs();
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Gateway job not found" });

  cancelGatewayJob(job);
  return res.status(202).json(serializeJob(job));
});

gatewayRouter.get("/jobs/:id/stream", async (req: Request, res: Response) => {
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

  trackGatewayStream(job, res);

  try {
    let torrent: any;
    const readinessAbortController = new AbortController();
    job.abortController = readinessAbortController;
    try {
      torrent = await prepareTorrent(job.magnet);
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
      });
    } finally {
      if (job.abortController === readinessAbortController) {
        job.abortController = undefined;
      }
    }
    if (isGatewayJobCancelled(job)) {
      return res.status(410).json({
        error: job.error || "Gateway job cancelled",
        retryable: false,
      });
    }
    if (job.mode === "remux") {
      const abortController = new AbortController();
      job.abortController = abortController;

      try {
        const result = await serveTorrentFile(req, res, torrent, {
          fileIdx: job.fileIdx,
          hints: job.hints,
          remuxFormat: "mp4",
          remuxStrategy: job.remuxStrategy,
          signal: abortController.signal,
          remuxTimeoutMs: GATEWAY_FIRST_BYTE_TIMEOUT_MS,
        });
        if (!isGatewayJobCancelled(job) && res.statusCode < 400) {
          job.state = "ready";
          job.retryable = false;
          addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");
        } else if (!isGatewayJobCancelled(job) && res.statusCode >= 400) {
          job.state = "error";
          job.error = "Remux preparation failed.";
          job.retryable = true;
          addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "error", {
            error: job.error,
          });
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
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "info");

    return serveTorrentFile(req, res, torrent, {
      fileIdx: job.fileIdx,
      hints: job.hints,
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
    job.state = "error";
    job.error = error;
    job.retryable = isRetryableGatewayError(err);
    job.updatedAt = Date.now();
    addGatewayJobBreadcrumb(job, "gateway.job_phase_changed", "error", {
      error,
    });
    if (!res.headersSent) {
      return res.status(503).json({ error, retryable: true });
    }
  }
});

export function __resetGatewayJobsForTests() {
  for (const job of jobs.values()) {
    if (job.progressTimer) clearInterval(job.progressTimer);
  }
  jobs.clear();
}

export function __pruneGatewayJobsForTests(now: number) {
  pruneJobs(now);
}
