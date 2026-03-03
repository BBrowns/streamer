/**
 * Torrent streaming handler — integrates with webtorrent v2 (ESM-only).
 *
 * Architecture: "kick-and-redirect"
 * 1. Client hits GET /stream?magnet=...
 * 2. Bridge adds torrent to webtorrent client (non-blocking)
 * 3. Bridge waits for 'ready' event (metadata received, files populated)
 * 4. Bridge starts a per-torrent HTTP server on a random port (if not already running)
 *    The webtorrent NodeServer handles range requests, partial content, DLNA etc natively
 * 5. Bridge returns 302 redirect → webtorrent server URL for the largest video file
 * 6. expo-video follows redirect, streams directly from webtorrent
 *
 * This avoids blocking a single HTTP request for up to 60s waiting for metadata.
 * The webtorrent server streams pieces as they arrive — no full download needed.
 */
import { Request, Response } from "express";
import { waitForReady } from "./torrent-helpers.js";

// Re-export pure helpers for stats.ts and tests
export { handleTorrent, waitForReady, mimeFromExt } from "./torrent-helpers.js";

// Lazily initialized webtorrent client
let client: any = null;

// Per-torrent server registry: infoHash → { server, port }
const torrentServers = new Map<string, { server: any; port: number }>();

/** Maximum concurrent connections per torrent peer */
const MAX_CONNS = parseInt(process.env.WT_MAX_CONNS || "55", 10);

export async function getClient(): Promise<any> {
  if (!client) {
    const WebTorrent = (await import("webtorrent")).default;
    client = new WebTorrent({ maxConns: MAX_CONNS });

    // Clean up server registry when a torrent is removed
    client.on("remove", (torrent: any) => {
      const entry = torrentServers.get(torrent.infoHash);
      if (entry) {
        try {
          entry.server.close();
        } catch {}
        torrentServers.delete(torrent.infoHash);
      }
    });

    client.on("error", (err: Error) => {
      console.error("[stream-server] WebTorrent client error:", err.message);
    });
  }
  return client;
}

/**
 * Gracefully destroy the webtorrent client and all per-torrent HTTP servers.
 * Called on process shutdown and exposed for testing.
 */
export async function destroyClient(): Promise<void> {
  if (!client) return;

  // Shut down all per-torrent HTTP servers
  for (const [hash, entry] of torrentServers) {
    try {
      entry.server.close();
    } catch {}
    torrentServers.delete(hash);
  }

  return new Promise<void>((resolve) => {
    client.destroy((err: Error | null) => {
      if (err)
        console.error("[stream-server] Error destroying client:", err.message);
      client = null;
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
 * Start (or retrieve) the webtorrent HTTP server for a specific torrent.
 * Returns the port number once the server is listening.
 */
async function getTorrentServerPort(torrent: any): Promise<number> {
  const existing = torrentServers.get(torrent.infoHash);
  if (existing) return existing.port;

  return new Promise((resolve, reject) => {
    // createServer() returns a NodeServer that extends Node's http.Server
    const server = torrent.createServer();

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        return reject(new Error("Could not bind torrent server"));
      }
      torrentServers.set(torrent.infoHash, { server, port: addr.port });
      resolve(addr.port);
    });

    server.on("error", (err: Error) => reject(err));
  });
}

/**
 * Pick the largest file from a torrent and return its path for the redirect URL.
 * webtorrent's server uses: /webtorrent/<infoHash>/<filePath>
 */
function getLargestFilePath(torrent: any): string {
  const file: any = torrent.files.reduce((a: any, b: any) =>
    (a.length ?? 0) > (b.length ?? 0) ? a : b,
  );
  return file.path;
}

export async function streamRequest(req: Request, res: Response) {
  const magnet = req.query.magnet as string;

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
    } else {
      // client.add() returns the Torrent synchronously (extends EventEmitter)
      torrent = torrentClient.add(magnet);
    }

    // Wait until metadata is received and files[] is populated (default timeout: 2 min)
    await waitForReady(torrent, 120_000);
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
    const port = await getTorrentServerPort(torrent);
    const filePath = getLargestFilePath(torrent);
    // Use the same host as the incoming request so mobile callers (LAN IP) can follow the redirect
    const host = req.hostname || "127.0.0.1";
    // webtorrent server URL format: /webtorrent/<infoHash>/<filePath>
    const streamUrl = `http://${host}:${port}/webtorrent/${torrent.infoHash}/${encodeURIComponent(filePath)}`;
    console.log(
      `[stream-server] Redirecting to webtorrent server: ${streamUrl}`,
    );
    return res.redirect(302, streamUrl);
  } catch (err: any) {
    console.error(
      "[stream-server] Failed to start torrent HTTP server:",
      err?.message,
    );
    return res.status(503).json({ error: "Failed to start stream server" });
  }
}
