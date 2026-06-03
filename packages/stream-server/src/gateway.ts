import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import { requireBridgeAuth } from "./security.js";
import {
  ensureTorrentReady,
  isTorrentEngineUnavailableError,
  prepareTorrent,
  serveTorrentFile,
} from "./torrent.js";
import type { FileSelectionHints } from "./torrent.js";

type GatewayJobState = "preparing" | "ready" | "error" | "cancelled";
type GatewayJobMode = "bridge" | "remux";
type GatewayJobPhase =
  | "finding_peers"
  | "preparing_metadata"
  | "ready"
  | "error"
  | "cancelled";

interface GatewayJob {
  id: string;
  magnet: string;
  infoHash?: string;
  fileIdx?: number;
  hints?: FileSelectionHints;
  mode: GatewayJobMode;
  state: GatewayJobState;
  error?: string;
  peerCount?: number;
  retryable?: boolean;
  progressTimer?: ReturnType<typeof setInterval>;
  createdAt: number;
  updatedAt: number;
}

const JOB_TTL_MS = 6 * 60 * 60 * 1000;
const TERMINAL_JOB_TTL_MS = 15 * 60 * 1000;
const GATEWAY_READY_TIMEOUT_MS = 120_000;
const jobs = new Map<string, GatewayJob>();

function parseInfoHash(magnet: string) {
  const match = magnet.match(/btih:([^&]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : undefined;
}

function sanitizeGatewayError(err: unknown) {
  const message = String((err as Error | undefined)?.message ?? err);
  if (isTorrentEngineUnavailableError(err)) return message;
  if (message.includes("Torrent ready timeout")) {
    return "Torrent metadata timed out. No peers found in 2 minutes.";
  }
  return message || "Gateway job failed";
}

function isRetryableGatewayError(error: unknown) {
  const message = sanitizeGatewayError(error).toLowerCase();
  return (
    message.includes("peer") ||
    message.includes("timeout") ||
    message.includes("metadata")
  );
}

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const terminalTtl =
      job.state === "ready" ||
      job.state === "error" ||
      job.state === "cancelled"
        ? TERMINAL_JOB_TTL_MS
        : JOB_TTL_MS;
    if (now - job.updatedAt > terminalTtl) {
      if (job.progressTimer) clearInterval(job.progressTimer);
      jobs.delete(id);
    }
  }
}

function getJobPhase(job: GatewayJob): GatewayJobPhase {
  if (job.state === "ready") return "ready";
  if (job.state === "error") return "error";
  if (job.state === "cancelled") return "cancelled";
  return (job.peerCount ?? 0) > 0 ? "preparing_metadata" : "finding_peers";
}

function getJobProgress(job: GatewayJob, elapsedMs: number) {
  if (job.state === "ready") return 1;
  if (job.state === "error" || job.state === "cancelled") return null;
  const elapsedProgress = elapsedMs / GATEWAY_READY_TIMEOUT_MS;
  const peerProgress = (job.peerCount ?? 0) > 0 ? 0.2 : 0;
  return Math.min(0.95, Math.max(peerProgress, elapsedProgress));
}

function serializeJob(job: GatewayJob) {
  const elapsedMs = Math.max(0, Date.now() - job.createdAt);
  return {
    id: job.id,
    state: job.state,
    phase: getJobPhase(job),
    mode: job.mode,
    infoHash: job.infoHash,
    fileIdx: job.fileIdx,
    error: job.error,
    retryable:
      job.retryable ?? (job.state === "preparing" || job.state === "error"),
    peerCount: job.peerCount ?? null,
    progress: getJobProgress(job, elapsedMs),
    elapsedMs,
    readyTimeoutMs: GATEWAY_READY_TIMEOUT_MS,
    playbackUrl:
      job.state === "cancelled" ? null : `/api/gateway/jobs/${job.id}/stream`,
    metricsUrl: job.infoHash
      ? `/api/torrent/${encodeURIComponent(job.infoHash)}/metrics`
      : null,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
  };
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
  job.state = "cancelled";
  job.error = error;
  job.retryable = false;
  job.updatedAt = Date.now();
}

function isGatewayJobCancelled(job: GatewayJob) {
  return job.state === "cancelled";
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

    await ensureTorrentReady(torrent, GATEWAY_READY_TIMEOUT_MS);
    if (isGatewayJobCancelled(job)) return;

    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;
    job.state = "ready";
    job.retryable = false;
    job.updatedAt = Date.now();
  } catch (err) {
    if (isGatewayJobCancelled(job)) return;
    job.state = "error";
    job.error = sanitizeGatewayError(err);
    job.retryable = isRetryableGatewayError(err);
    job.updatedAt = Date.now();
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
  const hints = parseFileSelectionHints(req.body);

  return {
    magnet,
    fileIdx,
    hints,
    mode: remux ? ("remux" as const) : ("bridge" as const),
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
    state: "preparing",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);

  try {
    const torrent = await prepareTorrent(job.magnet);
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? 0;
    job.updatedAt = Date.now();
    void warmGatewayJob(job, torrent);

    return res.status(202).json(serializeJob(job));
  } catch (err) {
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
  if (isGatewayJobCancelled(job)) {
    return res.status(410).json({
      error: job.error || "Gateway job cancelled",
      retryable: false,
    });
  }
  if (job.state === "error") {
    return res.status(503).json({
      error: job.error || "Gateway job failed",
      retryable: true,
    });
  }

  try {
    const torrent = await prepareTorrent(job.magnet);
    if (isGatewayJobCancelled(job)) {
      return res.status(410).json({
        error: job.error || "Gateway job cancelled",
        retryable: false,
      });
    }
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;
    job.updatedAt = Date.now();

    await ensureTorrentReady(torrent, GATEWAY_READY_TIMEOUT_MS);
    if (isGatewayJobCancelled(job)) {
      return res.status(410).json({
        error: job.error || "Gateway job cancelled",
        retryable: false,
      });
    }
    job.state = "ready";
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;
    job.retryable = false;
    job.updatedAt = Date.now();

    return serveTorrentFile(req, res, torrent, {
      fileIdx: job.fileIdx,
      hints: job.hints,
      remuxFormat: job.mode === "remux" ? "mp4" : undefined,
    });
  } catch (err) {
    const error = sanitizeGatewayError(err);
    job.state = "error";
    job.error = error;
    job.retryable = isRetryableGatewayError(err);
    job.updatedAt = Date.now();
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
