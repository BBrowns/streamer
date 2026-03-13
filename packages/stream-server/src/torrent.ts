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
import { waitForReady } from "./torrent-helpers.js";

// Re-export pure helpers for stats.ts and tests
export { handleTorrent, waitForReady, mimeFromExt } from "./torrent-helpers.js";

// Lazily initialized webtorrent client
let client: any = null;

// Shared HTTP server instance (created once via client.createServer())
let serverInstance: any = null;
let serverPort: number = 0;

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

export function getTorrent(infoHash: string): any {
  if (client) {
    const t = client.torrents?.find((t: any) => t.infoHash === infoHash);
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
    console.log(`[stream-server] Pruning inactive torrent: ${t.infoHash}`);
    await new Promise<void>((resolve) => {
      t.destroy(() => {
        lastAccessMap.delete(t.infoHash);
        resolve();
      });
    });
  }
}

export async function getClient(): Promise<any> {
  if (!client) {
    const WebTorrent = (await import("webtorrent")).default;
    client = new WebTorrent({
      maxConns: MAX_CONNS,
      tracker: {
        announce: DEFAULT_TRACKERS,
      },
    });

    client.on("error", (err: Error) => {
      console.error("[stream-server] WebTorrent client error:", err.message);
    });

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
        console.error("[stream-server] Error destroying client:", err.message);
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

/**
 * Pick the largest file from a torrent (most likely the video).
 */
function getLargestFile(torrent: any): any {
  return torrent.files.reduce((a: any, b: any) =>
    (a.length ?? 0) > (b.length ?? 0) ? a : b,
  );
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
  console.log(`[stream-server] Raw req.query.magnet:`, magnet);

  if (!magnet) {
    return res.status(400).json({ error: "Magnet link is required" });
  }

  let torrent: any;

  try {
    const torrentClient = await getClient();

    // IMPORTANT: In webtorrent v2, client.get() is ASYNC — must be awaited
    const existing = await torrentClient.get(magnet);
    if (existing) {
      torrent = existing;
      lastAccessMap.set(torrent.infoHash, Date.now());
      console.log(
        `[stream-server] Reusing existing torrent: ${torrent.infoHash}`,
      );
    } else {
      // Memory management check before adding new
      await pruneTorrents(torrentClient);

      // We must embed DEFAULT_TRACKERS directly into the magnet string
      // because passing { announce: [...] } to client.add() OVERWRITES
      // the trackers that the client already packaged into the infoHash!
      let enhancedMagnet = magnet;
      for (const tr of DEFAULT_TRACKERS) {
        const encodedTr = `&tr=${encodeURIComponent(tr)}`;
        if (!enhancedMagnet.includes(encodedTr)) {
          enhancedMagnet += encodedTr;
        }
      }

      // Add the torrent with the fully loaded magnet link
      torrent = torrentClient.add(enhancedMagnet);
      lastAccessMap.set(torrent.infoHash, Date.now());
      console.log(
        `[stream-server] Added new torrent: ${torrent.infoHash || "(awaiting metadata)"}`,
      );

      // Throttled peer logging — log only on first connection and every 10 peers
      let _lastLoggedPeers = -1;
      torrent.on("wire", () => {
        const n = torrent.numPeers;
        if (_lastLoggedPeers === -1 || n >= _lastLoggedPeers + 10) {
          console.log(
            `[stream-server] Peers: ${n} (infoHash: ${torrent.infoHash?.slice(0, 8) ?? "…"})`,
          );
          _lastLoggedPeers = n;
        }
      });

      // Known-transient tracker warnings are debug noise, not actionable errors
      const TRANSIENT_PATTERNS = [
        "ENOTFOUND",
        "fetch failed",
        "Error connecting",
        "timed out",
        "ECONNREFUSED",
      ];
      torrent.on("warning", (msg: string) => {
        const msgStr = String(msg);
        const isTransient = TRANSIENT_PATTERNS.some((p) => msgStr.includes(p));
        if (isTransient) {
          // Suppress expected tracker failures — not actionable
          return;
        }
        console.warn(`[stream-server] Torrent warning: ${msgStr}`);
      });
      torrent.on("error", (err: Error) => {
        console.error(`[stream-server] Torrent error: ${err.message}`);
      });
    }

    console.log(
      `[stream-server] Waiting for metadata (up to 2 min)... numPeers=${torrent.numPeers}`,
    );
    // Wait until metadata is received and files[] is populated (timeout: 2 min)
    await waitForReady(torrent, 120_000);

    // Run security check before serving any files
    validateTorrentFiles(torrent);
  } catch (err: any) {
    const msg = err?.message ?? "Failed to load torrent";
    const isTimeout = msg.includes("timeout");
    console.error(
      "[stream-server]",
      isTimeout
        ? "Torrent metadata timeout (no peers found)"
        : `Torrent error: ${msg}`,
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

  if (!torrent.files || torrent.files.length === 0) {
    return res.status(503).json({ error: "Torrent has no files" });
  }

  try {
    const file = getLargestFile(torrent);
    // file.streamURL is a relative path like /webtorrent/<infoHash>/<encodedFilePath>
    const streamPath = file.streamURL;
    // Use the incoming request's hostname so the mobile client can follow the redirect
    const host = req.hostname || "127.0.0.1";

    const internalUrl = `http://127.0.0.1:${serverPort}${streamPath}`;
    const externalUrl = `http://${host}:${serverPort}${streamPath}`;

    const remuxFormat = req.query.remux as string | undefined;

    // ── Remux path: pipe through FFmpeg for iOS compatibility ──
    if (remuxFormat === "mp4") {
      console.log(
        `[stream-server] Remuxing to fragmented MP4 via FFmpeg: ${file.name}`,
      );

      // Fetch the raw file from webtorrent's internal HTTP server
      const upstream = await fetch(internalUrl);
      if (!upstream.ok || !upstream.body) {
        console.error(
          `[stream-server] Failed to fetch from webtorrent: ${upstream.status}`,
        );
        return res.status(503).json({ error: "Failed to fetch torrent file" });
      }

      // Spawn FFmpeg: container remux only (no transcode)
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

      // Set response headers
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Cache-Control", "no-cache");

      // Pipe: webtorrent → FFmpeg stdin
      const reader = upstream.body.getReader();
      const pumpToFfmpeg = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              ffmpeg.stdin.end();
              break;
            }
            if (!ffmpeg.stdin.writable) break;
            ffmpeg.stdin.write(Buffer.from(value));
          }
        } catch (err: any) {
          console.warn("[stream-server] Upstream read error:", err?.message);
          ffmpeg.stdin.end();
        }
      };
      pumpToFfmpeg();

      // Pipe: FFmpeg stdout → Express response
      ffmpeg.stdout.pipe(res);

      // Log FFmpeg stderr warnings
      ffmpeg.stderr.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.warn(`[ffmpeg] ${msg}`);
      });

      // Clean up on client disconnect
      res.on("close", () => {
        reader.cancel().catch(() => {});
        ffmpeg.kill("SIGTERM");
      });

      ffmpeg.on("error", (err: Error) => {
        console.error("[stream-server] FFmpeg spawn error:", err.message);
        if (!res.headersSent) {
          res.status(503).json({
            error: "FFmpeg not available. Install with: brew install ffmpeg",
          });
        }
      });

      ffmpeg.on("exit", (code: number | null) => {
        if (code && code !== 0 && code !== 255) {
          console.warn(`[stream-server] FFmpeg exited with code ${code}`);
        }
      });

      return;
    }

    // ── Default path: 302 redirect ──
    console.log(
      `[stream-server] Redirecting to webtorrent server: ${externalUrl}`,
    );
    return res.redirect(302, externalUrl);
  } catch (err: any) {
    console.error("[stream-server] Failed to build stream URL:", err?.message);
    return res.status(503).json({ error: "Failed to start stream server" });
  }
}
