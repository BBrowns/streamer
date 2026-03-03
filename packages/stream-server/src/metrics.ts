import type { Request, Response } from "express";
import { getTorrent } from "./torrent.js";
import type { Torrent } from "webtorrent";

export interface TorrentMetrics {
  state: "finding_peers" | "connecting" | "downloading" | "ready";
  numPeers: number;
  downloadSpeed: number;
  progress: number;
  downloaded: number;
}

function getTorrentState(torrent: Torrent): TorrentMetrics["state"] {
  if (torrent.ready) return "ready";
  if (torrent.numPeers > 0 && torrent.downloadSpeed > 0) return "downloading";
  if (torrent.numPeers > 0) return "connecting";
  return "finding_peers";
}

export function metricsHandler(req: Request, res: Response): void {
  const { infoHash } = req.params;

  if (!infoHash || typeof infoHash !== "string") {
    res.status(400).json({ error: "Missing or invalid infoHash" });
    return;
  }

  const torrent = getTorrent(infoHash);
  if (!torrent) {
    res.status(404).json({ error: "Torrent not found or not active" });
    return;
  }

  // Set headers for Server-Sent Events (SSE)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Flush the headers immediately
  res.flushHeaders?.();

  // Send initial state immediately
  const pushMetrics = () => {
    const metrics: TorrentMetrics = {
      state: getTorrentState(torrent),
      numPeers: torrent.numPeers,
      downloadSpeed: torrent.downloadSpeed,
      progress: torrent.progress,
      downloaded: torrent.downloaded,
    };
    // SSE format: "data: <json>\n\n"
    res.write(`data: ${JSON.stringify(metrics)}\n\n`);
  };

  pushMetrics();

  // Push metrics every 1000ms
  const intervalId = setInterval(pushMetrics, 1000);

  // Clean up when the client closes the connection
  req.on("close", () => {
    clearInterval(intervalId);
  });
}
