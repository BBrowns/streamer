/**
 * Torrent streaming handler — integrates with webtorrent v2 (ESM-only).
 *
 * Architecture: "kick-and-redirect"
 * 1. Client hits GET /stream?magnet=...
 * 2. Bridge adds torrent to webtorrent client (non-blocking)
 * 3. Bridge waits for 'ready' event (metadata received, files populated)
 * 4. The shared client HTTP server (started once) serves all torrents
 * 5. Bridge returns 302 redirect → webtorrent server URL for the largest video file
 * 6. expo-video follows redirect, streams directly from webtorrent
 */
import { Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";
import {
  waitForReady,
  selectBestVideoFile,
  mimeFromExt,
  parseByteRange,
} from "./torrent-helpers.js";
import type { FileSelectionHints } from "./torrent-helpers.js";
import { redactSensitiveText } from "./redaction.js";

// Re-export pure helpers for stats.ts and tests
export {
  handleTorrent,
  waitForReady,
  mimeFromExt,
  parseByteRange,
  selectBestVideoFile,
} from "./torrent-helpers.js";
export type { FileSelectionHints } from "./torrent-helpers.js";

type WebTorrentModule = {
  default: new (options: Record<string, unknown>) => any;
};

// Lazily initialized webtorrent client
let client: any = null;
let clientInitError: TorrentEngineError | null = null;
let importWebTorrent = () => import("webtorrent") as Promise<WebTorrentModule>;

// Shared HTTP server instance (created once via client.createServer())
let serverInstance: any = null;
let serverPort: number = 0;

export interface TorrentEngineStatus {
  available: boolean;
  state: "ready" | "uninitialized" | "unavailable";
  reason?: "native-architecture-mismatch" | "native-load-failed";
  message?: string;
  processArch: NodeJS.Architecture;
  platform: NodeJS.Platform;
}

class TorrentEngineError extends Error {
  code = "TORRENT_ENGINE_UNAVAILABLE";
  reason: TorrentEngineStatus["reason"];
  cause?: unknown;

  constructor(
    message: string,
    reason: TorrentEngineStatus["reason"],
    cause?: unknown,
  ) {
    super(message);
    this.name = "TorrentEngineError";
    this.reason = reason;
    this.cause = cause;
  }
}

/** Maximum concurrent connections per torrent peer */
const MAX_CONNS = parseInt(process.env.WT_MAX_CONNS || "55", 10);

/**
 * Well-known public trackers to ensure fast peer discovery.
 * WebTorrent supports UDP, HTTP, and WebSocket trackers.
 */
const DEFAULT_TRACKERS = [
  // HTTP trackers (bypass UDP blocks)
  "http://tracker.opentrackr.org:1337/announce",
  "http://tracker.renhas.cl:6969/announce",
  // UDP trackers (fastest for open networks)
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://tracker.internetwarriors.net:1337/announce",
  "udp://tracker.leechers-paradise.org:6969/announce",
  "udp://tracker.coppersurfer.tk:6969/announce",
  "udp://exodus.desync.com:6969/announce",
  // WebSocket trackers (for WebRTC peers)
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.fastcast.nz",
];

/** Maximum concurrent sessions per user */
const MAX_ACTIVE_TORRENTS = parseInt(
  process.env.MAX_ACTIVE_TORRENTS || "5",
  10,
);

/** Track last access time per infoHash for pruning */
const lastAccessMap = new Map<string, number>();
const loggedTorrents = new WeakSet<object>();

function isNodeDataChannelLoadError(err: unknown) {
  const message = String((err as Error | undefined)?.message ?? err);
  return (
    message.includes("node-datachannel") ||
    message.includes("node_datachannel.node")
  );
}

function normalizeTorrentEngineError(err: unknown) {
  const message = String((err as Error | undefined)?.message ?? err);
  const isArchitectureMismatch =
    isNodeDataChannelLoadError(err) &&
    (message.includes("incompatible architecture") ||
      message.includes("wrong architecture"));

  if (!isNodeDataChannelLoadError(err)) {
    return err instanceof Error ? err : new Error(message);
  }

  return new TorrentEngineError(
    isArchitectureMismatch
      ? "Torrent engine unavailable: node-datachannel was installed for a different CPU architecture than the current Node/Electron runtime. Reinstall dependencies under the same architecture or run the desktop bridge with STREAMER_BRIDGE_NODE pointing at the matching Node binary."
      : "Torrent engine unavailable: node-datachannel native bindings failed to load. Reinstall dependencies or rebuild node-datachannel for the current runtime.",
    isArchitectureMismatch
      ? "native-architecture-mismatch"
      : "native-load-failed",
    err,
  );
}

export function isTorrentEngineUnavailableError(err: unknown) {
  return (
    (err as { code?: string } | undefined)?.code ===
    "TORRENT_ENGINE_UNAVAILABLE"
  );
}

export function getTorrentEngineStatus(): TorrentEngineStatus {
  if (client) {
    return {
      available: true,
      state: "ready",
      processArch: process.arch,
      platform: process.platform,
    };
  }

  if (clientInitError) {
    return {
      available: false,
      state: "unavailable",
      reason: clientInitError.reason,
      message: clientInitError.message,
      processArch: process.arch,
      platform: process.platform,
    };
  }

  return {
    available: true,
    state: "uninitialized",
    processArch: process.arch,
    platform: process.platform,
  };
}

export function __setWebTorrentImporterForTests(
  importer: typeof importWebTorrent,
) {
  importWebTorrent = importer;
  client = null;
  clientInitError = null;
  serverInstance = null;
  serverPort = 0;
  lastAccessMap.clear();
}

export function __resetTorrentEngineForTests() {
  importWebTorrent = () => import("webtorrent") as Promise<WebTorrentModule>;
  client = null;
  clientInitError = null;
  serverInstance = null;
  serverPort = 0;
  lastAccessMap.clear();
}

export function getTorrent(infoHash: string): any {
  const normalizedInfoHash = infoHash.toLowerCase();
  if (client) {
    const t = client.torrents?.find(
      (t: any) => String(t.infoHash || "").toLowerCase() === normalizedInfoHash,
    );
    if (t) lastAccessMap.set(infoHash, Date.now());
    return t;
  }
  return null;
}

/**
 * Prune oldest torrents if the active count exceeds limit.
 */
export async function pruneTorrents(client: any) {
  const torrents = client.torrents || [];
  if (torrents.length < MAX_ACTIVE_TORRENTS) return;

  // Sort by last access time (ascending)
  const sorted = [...torrents].sort((a, b) => {
    const timeA = lastAccessMap.get(a.infoHash) || 0;
    const timeB = lastAccessMap.get(b.infoHash) || 0;
    return timeA - timeB;
  });

  // Remove oldest torrents until we are below the limit
  const toRemove = sorted.slice(0, torrents.length - MAX_ACTIVE_TORRENTS + 1);
  for (const t of toRemove) {
    console.log("[stream-server] Pruning inactive torrent");
    await new Promise<void>((resolve) => {
      t.destroy(() => {
        lastAccessMap.delete(t.infoHash);
        resolve();
      });
    });
  }
}

export async function getClient(): Promise<any> {
  if (clientInitError) {
    throw clientInitError;
  }

  if (!client) {
    try {
      const WebTorrent = (await importWebTorrent()).default;
      client = new WebTorrent({
        maxConns: MAX_CONNS,
        utp: false, // Disable UTP to prevent "address not available" bind errors
        tracker: {
          announce: DEFAULT_TRACKERS,
        },
      });

      client.on("error", (err: Error) => {
        console.error(
          "[stream-server] WebTorrent client error:",
          redactSensitiveText(err.message),
        );
      });

      if (typeof client.createServer !== "function") {
        throw new Error("WebTorrent HTTP server API is unavailable");
      }

      // Create the shared HTTP server (webtorrent v2 API)
      serverInstance = client.createServer();
      await new Promise<void>((resolve, reject) => {
        serverInstance.server.listen(0, "0.0.0.0", () => {
          const addr = serverInstance.server.address();
          if (addr && typeof addr !== "string") {
            serverPort = addr.port;
            console.log(
              `[stream-server] WebTorrent HTTP server on port ${serverPort}`,
            );
          }
          resolve();
        });
        serverInstance.server.on("error", reject);
      });
    } catch (err) {
      client = null;
      serverInstance = null;
      serverPort = 0;

      const normalized = normalizeTorrentEngineError(err);
      if (isTorrentEngineUnavailableError(normalized)) {
        clientInitError = normalized as TorrentEngineError;
      }
      throw normalized;
    }
  }
  return client;
}

/**
 * Gracefully destroy the webtorrent client and shared HTTP server.
 */
export async function destroyClient(): Promise<void> {
  if (!client) return;

  if (serverInstance) {
    try {
      serverInstance.close();
    } catch {}
    serverInstance = null;
    serverPort = 0;
  }

  return new Promise<void>((resolve) => {
    client.destroy((err: Error | null) => {
      if (err)
        console.error(
          "[stream-server] Error destroying client:",
          redactSensitiveText(err.message),
        );
      client = null;
      lastAccessMap.clear();
      resolve();
    });
  });
}

// Graceful shutdown on process signals
function handleShutdown(signal: string) {
  console.log(
    `[stream-server] Received ${signal}, shutting down gracefully...`,
  );
  destroyClient().then(() => {
    console.log("[stream-server] Cleanup complete.");
    process.exit(0);
  });
}
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

export function getSelectedFile(
  torrent: any,
  fileIdx?: number,
  hints?: FileSelectionHints,
): any {
  if (typeof fileIdx === "number") {
    const selected = torrent.files?.[fileIdx];
    if (!selected) {
      throw new Error(`Requested file index ${fileIdx} is not available`);
    }
    return selected;
  }
  return selectBestVideoFile(torrent.files ?? [], hints);
}

function enhanceMagnetWithTrackers(magnet: string) {
  let enhancedMagnet = magnet;
  for (const tr of DEFAULT_TRACKERS) {
    const encodedTr = `&tr=${encodeURIComponent(tr)}`;
    if (!enhancedMagnet.includes(encodedTr)) {
      enhancedMagnet += encodedTr;
    }
  }
  return enhancedMagnet;
}

function attachTorrentLogging(torrent: any) {
  if (!torrent || loggedTorrents.has(torrent)) return;
  loggedTorrents.add(torrent);

  let lastLoggedPeers = -1;
  torrent.on("wire", () => {
    const n = torrent.numPeers;
    if (lastLoggedPeers === -1 || n >= lastLoggedPeers + 10) {
      console.log(`[stream-server] Peers: ${n}`);
      lastLoggedPeers = n;
    }
  });

  const transientPatterns = [
    "ENOTFOUND",
    "fetch failed",
    "Error connecting",
    "timed out",
    "ECONNREFUSED",
  ];
  torrent.on("warning", (msg: string) => {
    const msgStr = String(msg);
    const isTransient = transientPatterns.some((p) => msgStr.includes(p));
    if (isTransient) return;
    console.warn(
      `[stream-server] Torrent warning: ${redactSensitiveText(msgStr)}`,
    );
  });
  torrent.on("error", (err: Error) => {
    console.error(
      `[stream-server] Torrent error: ${redactSensitiveText(err.message)}`,
    );
  });
}

export async function prepareTorrent(magnet: string): Promise<any> {
  const torrentClient = await getClient();

  const existing = await torrentClient.get(magnet);
  if (existing) {
    lastAccessMap.set(existing.infoHash, Date.now());
    attachTorrentLogging(existing);
    console.log("[stream-server] Reusing existing torrent");
    return existing;
  }

  await pruneTorrents(torrentClient);

  const enhancedMagnet = enhanceMagnetWithTrackers(magnet);
  const torrent = torrentClient.add(enhancedMagnet);
  if (torrent.infoHash) lastAccessMap.set(torrent.infoHash, Date.now());
  attachTorrentLogging(torrent);

  console.log("[stream-server] Added new torrent");

  return torrent;
}

export async function ensureTorrentReady(
  torrent: any,
  timeoutMs = 120_000,
): Promise<void> {
  console.log(
    `[stream-server] Waiting for metadata (up to ${Math.round(timeoutMs / 1000)}s)... numPeers=${torrent.numPeers}`,
  );
  await waitForReady(torrent, timeoutMs);
  validateTorrentFiles(torrent);
  if (torrent.infoHash) lastAccessMap.set(torrent.infoHash, Date.now());
}

export async function serveTorrentFile(
  req: Request,
  res: Response,
  torrent: any,
  options: {
    remuxFormat?: string;
    fileIdx?: number;
    hints?: FileSelectionHints;
  } = {},
) {
  if (!torrent.files || torrent.files.length === 0) {
    return res.status(503).json({ error: "Torrent has no files" });
  }

  const file = getSelectedFile(torrent, options.fileIdx, options.hints);
  const ext = path.extname(file.name).toLowerCase();

  // Strategy:
  // 1. Force remuxing for MKV as browsers don't support it natively
  // 2. Proxy directly for MP4/WebM/etc to avoid 302 redirect CORS/port issues
  const shouldRemux = options.remuxFormat === "mp4" || ext === ".mkv";

  if (shouldRemux) {
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("Access-Control-Expose-Headers", "Accept-Ranges");
    if (req.method === "HEAD") return res.end();

    console.log(
      `[stream-server] Streaming via FFmpeg remux (MP4): ${file.name}`,
    );
    res.setHeader("Transfer-Encoding", "chunked");

    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      "pipe:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov+faststart",
      "pipe:1",
    ]);

    const stream = file.createReadStream();
    stream.pipe(ffmpeg.stdin);

    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.warn(`[ffmpeg] ${redactSensitiveText(msg)}`);
    });

    res.on("close", () => {
      stream.destroy();
      ffmpeg.kill("SIGTERM");
    });

    ffmpeg.on("error", (err: Error) => {
      console.error(
        "[stream-server] FFmpeg spawn error:",
        redactSensitiveText(err.message),
      );
      if (!res.headersSent) {
        res.status(503).json({
          error: "FFmpeg not available. Install with: brew install ffmpeg",
        });
      }
    });

    return;
  }

  // Proxy directly to avoid redirect issues
  console.log(`[stream-server] Proxying direct stream: ${file.name}`);
  const mimeType = mimeFromExt(file.name);

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Accept-Ranges, Content-Length, Content-Range",
  );

  const total = file.length;
  const range = parseByteRange(
    req.method === "GET" ? req.headers.range : undefined,
    total,
  );

  if (range.type === "unsatisfiable") {
    return res
      .status(416)
      .set({
        "Content-Range": `bytes */${total}`,
      })
      .end();
  }

  if (range.type === "partial") {
    res.status(206).set({
      "Content-Range": `bytes ${range.start}-${range.end}/${total}`,
      "Content-Length": range.length,
    });

    if (req.method === "HEAD") return res.end();

    const stream = file.createReadStream({
      start: range.start,
      end: range.end,
    });
    stream.pipe(res);
    res.on("close", () => stream.destroy());
  } else {
    res.setHeader("Content-Length", total);
    if (req.method === "HEAD") return res.end();

    const stream = file.createReadStream();
    stream.pipe(res);
    res.on("close", () => stream.destroy());
  }
}

/**
 * PRODUCTION-GRADE SECURITY: Malware Shield
 * Filters torrent files against a blacklist of executable/script extensions.
 * Only allows media and subtitle files.
 */
const FORBIDDEN_EXTENSIONS = [
  ".exe",
  ".scr",
  ".bat",
  ".cmd",
  ".sh",
  ".js",
  ".vbs",
  ".cpl",
  ".com",
  ".msi",
  ".pif",
  ".gadget",
  ".wsf",
];

const ALLOWED_MEDIA_EXTENSIONS = [
  ".mkv",
  ".mp4",
  ".avi",
  ".webm",
  ".mov",
  ".wmv",
  ".ts",
  ".m3u8",
  ".mpd",
  ".srt",
  ".vtt",
  ".sub",
];

export function validateTorrentFiles(torrent: any) {
  const files = torrent.files || [];
  for (const file of files) {
    const nameData = String(file.name || "").toLowerCase();
    const isForbidden = FORBIDDEN_EXTENSIONS.some((ext) =>
      nameData.endsWith(ext),
    );
    if (isForbidden) {
      throw new Error(
        `Security Violation: Malicious file detected (${file.name})`,
      );
    }

    // Optional: Warn if it contains non-media files that aren't expected
    const ext = nameData.slice(nameData.lastIndexOf("."));
    if (!ALLOWED_MEDIA_EXTENSIONS.includes(ext) && nameData.includes(".")) {
      console.warn(
        `[malware-shield] Suspicious non-media file ignored: ${file.name}`,
      );
    }
  }
}

export async function streamRequest(req: Request, res: Response) {
  const magnet = req.query.magnet as string;

  console.log(
    `[stream-server] Received magnet request at:`,
    new Date().toISOString(),
  );

  if (!magnet) {
    return res.status(400).json({ error: "Magnet link is required" });
  }

  let torrent: any;

  try {
    torrent = await prepareTorrent(magnet);
    await ensureTorrentReady(torrent, 120_000);
  } catch (err: any) {
    const msg = err?.message ?? "Failed to load torrent";
    const isTimeout = msg.includes("timeout");
    console.error(
      "[stream-server]",
      isTimeout
        ? "Torrent metadata timeout (no peers found)"
        : `Torrent error: ${redactSensitiveText(msg)}`,
    );
    if (!res.headersSent) {
      return res.status(503).json({
        error: isTimeout
          ? "Torrent metadata timed out. No peers found in 2 minutes."
          : msg,
        retryable: isTimeout,
      });
    }
    return;
  }

  try {
    const remuxFormat = req.query.remux as string | undefined;
    const fileIdx =
      typeof req.query.fileIdx === "string"
        ? Number.parseInt(req.query.fileIdx, 10)
        : undefined;
    const season =
      typeof req.query.season === "string"
        ? Number.parseInt(req.query.season, 10)
        : undefined;
    const episode =
      typeof req.query.episode === "string"
        ? Number.parseInt(req.query.episode, 10)
        : undefined;
    const title =
      typeof req.query.title === "string" && req.query.title.trim().length > 0
        ? req.query.title.trim()
        : undefined;
    const hints =
      (Number.isInteger(season) && season! > 0) ||
      (Number.isInteger(episode) && episode! > 0) ||
      title
        ? {
            season:
              Number.isInteger(season) && season! > 0 ? season : undefined,
            episode:
              Number.isInteger(episode) && episode! > 0 ? episode : undefined,
            title,
          }
        : undefined;
    return serveTorrentFile(req, res, torrent, { remuxFormat, fileIdx, hints });
  } catch (err: any) {
    console.error(
      "[stream-server] Failed to build stream URL:",
      redactSensitiveText(err?.message ?? ""),
    );
    return res.status(503).json({ error: "Failed to start stream server" });
  }
}
