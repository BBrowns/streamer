import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import { requireBridgeAuth } from "./security.js";
import {
  ensureTorrentReady,
  isTorrentEngineUnavailableError,
  prepareTorrent,
  serveTorrentFile,
} from "./torrent.js";

type GatewayJobState = "preparing" | "ready" | "error";
type GatewayJobMode = "bridge" | "remux";

interface GatewayJob {
  id: string;
  magnet: string;
  infoHash?: string;
  fileIdx?: number;
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
    if (now - job.updatedAt > JOB_TTL_MS) {
      if (job.progressTimer) clearInterval(job.progressTimer);
      jobs.delete(id);
    }
  }
}

function serializeJob(job: GatewayJob) {
  const elapsedMs = Math.max(0, Date.now() - job.createdAt);
  return {
    id: job.id,
    state: job.state,
    mode: job.mode,
    infoHash: job.infoHash,
    fileIdx: job.fileIdx,
    error: job.error,
    retryable: job.retryable ?? job.state === "preparing",
    peerCount: job.peerCount ?? null,
    elapsedMs,
    readyTimeoutMs: GATEWAY_READY_TIMEOUT_MS,
    playbackUrl: `/api/gateway/jobs/${job.id}/stream`,
    metricsUrl: job.infoHash
      ? `/api/torrent/${encodeURIComponent(job.infoHash)}/metrics`
      : null,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
  };
}

function trackGatewayJobProgress(job: GatewayJob, torrent: any) {
  job.peerCount = torrent?.numPeers ?? 0;
  job.progressTimer = setInterval(() => {
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
    job.infoHash = torrent.infoHash || job.infoHash;
    stopProgressTracking = trackGatewayJobProgress(job, torrent);
    job.updatedAt = Date.now();

    await ensureTorrentReady(torrent, GATEWAY_READY_TIMEOUT_MS);
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;
    job.state = "ready";
    job.retryable = false;
    job.updatedAt = Date.now();
  } catch (err) {
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

  return {
    magnet,
    fileIdx,
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

gatewayRouter.get("/jobs/:id/stream", async (req: Request, res: Response) => {
  pruneJobs();
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Gateway job not found" });
  if (job.state === "error") {
    return res.status(503).json({
      error: job.error || "Gateway job failed",
      retryable: true,
    });
  }

  try {
    const torrent = await prepareTorrent(job.magnet);
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;
    job.updatedAt = Date.now();

    await ensureTorrentReady(torrent, GATEWAY_READY_TIMEOUT_MS);
    job.state = "ready";
    job.infoHash = torrent.infoHash || job.infoHash;
    job.peerCount = torrent.numPeers ?? job.peerCount ?? 0;
    job.retryable = false;
    job.updatedAt = Date.now();

    return serveTorrentFile(req, res, torrent, {
      fileIdx: job.fileIdx,
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
