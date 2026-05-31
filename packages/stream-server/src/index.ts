import express from "express";
import cors from "cors";
import { pathToFileURL } from "url";
import { streamRequest, getClient, getTorrentEngineStatus } from "./torrent.js";
import { getStats } from "./stats.js";
import { castRouter } from "./cast.js";
import { metricsHandler } from "./metrics.js";
import { getSubtitlesRequest, streamSubtitleRequest } from "./subtitles.js";
import { handoffRouter } from "./handoff.js";

const PORT = process.env.PORT || 11470;

// Prevent EIO errors in background/headless environments by pausing stdin
if (process.stdin.isTTY) {
  process.stdin.pause();
}

export function createStreamServerApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/cast", castRouter);

  app.get("/api/health", async (_req, res) => {
    const memUsage = process.memoryUsage();
    let torrentCount = 0;
    try {
      const client = await getClient();
      torrentCount = client.torrents?.length ?? 0;
    } catch {
      /* client not yet initialized */
    }

    res.json({
      status: "active",
      torrentEngine: getTorrentEngineStatus(),
      version: "1.0.0",
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
      },
      activeTorrents: torrentCount,
    });
  });

  // Legacy status endpoint (keep backward compat)
  app.get("/status", (_req, res) => {
    res.json({ status: "active", version: "1.0.0" });
  });

  app.get("/stream", streamRequest);

  app.get("/stats", async (_req, res) => {
    res.json(await getStats());
  });

  app.get("/api/torrent/:infoHash/metrics", metricsHandler);

  app.get("/api/subtitles", getSubtitlesRequest);
  app.get("/api/subtitles/:id/stream", streamSubtitleRequest);

  app.use("/api/handoff", handoffRouter);

  return app;
}

export function startStreamServer(port: number | string = PORT) {
  const app = createStreamServerApp();
  return app.listen(Number(port), "0.0.0.0", () => {
    console.log(`Stream server (Bridge) running on http://0.0.0.0:${port}`);
  });
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  startStreamServer();
}
