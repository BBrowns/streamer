import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
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
  createdAt: number;
  updatedAt: number;
}

const JOB_TTL_MS = 6 * 60 * 60 * 1000;
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

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

function serializeJob(job: GatewayJob) {
  return {
    id: job.id,
    state: job.state,
    mode: job.mode,
    infoHash: job.infoHash,
    fileIdx: job.fileIdx,
    error: job.error,
    playbackUrl: `/api/gateway/jobs/${job.id}/stream`,
    metricsUrl: job.infoHash
      ? `/api/torrent/${encodeURIComponent(job.infoHash)}/metrics`
      : null,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
  };
}

async function warmGatewayJob(job: GatewayJob, preparedTorrent?: any) {
  try {
    const torrent = preparedTorrent ?? (await prepareTorrent(job.magnet));
    job.infoHash = torrent.infoHash || job.infoHash;
    job.updatedAt = Date.now();

    await ensureTorrentReady(torrent, 120_000);
    job.infoHash = torrent.infoHash || job.infoHash;
    job.state = "ready";
    job.updatedAt = Date.now();
  } catch (err) {
    job.state = "error";
    job.error = sanitizeGatewayError(err);
    job.updatedAt = Date.now();
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

gatewayRouter.post("/jobs", async (req, res) => {
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

gatewayRouter.get("/jobs/:id", (req, res) => {
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
    job.updatedAt = Date.now();

    await ensureTorrentReady(torrent, 120_000);
    job.state = "ready";
    job.infoHash = torrent.infoHash || job.infoHash;
    job.updatedAt = Date.now();

    return serveTorrentFile(req, res, torrent, {
      fileIdx: job.fileIdx,
      remuxFormat: job.mode === "remux" ? "mp4" : undefined,
    });
  } catch (err) {
    const error = sanitizeGatewayError(err);
    job.state = "error";
    job.error = error;
    job.updatedAt = Date.now();
    if (!res.headersSent) {
      return res.status(503).json({ error, retryable: true });
    }
  }
});

export function __resetGatewayJobsForTests() {
  jobs.clear();
}
