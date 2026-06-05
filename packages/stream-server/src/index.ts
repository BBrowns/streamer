import express from "express";
import cors from "cors";
import { pathToFileURL } from "url";
import { streamRequest, getClient, getTorrentEngineStatus } from "./torrent.js";
import { getStats } from "./stats.js";
import { castRouter } from "./cast.js";
import { metricsHandler } from "./metrics.js";
import { getSubtitlesRequest, streamSubtitleRequest } from "./subtitles.js";
import { handoffRouter } from "./handoff.js";
import { gatewayRouter } from "./gateway.js";
import { requireBridgeAuth } from "./security.js";
import { redactSensitiveText } from "./redaction.js";
import {
  captureStreamServerException,
  initStreamServerSentry,
} from "./sentry.js";

const PORT = process.env.PORT || 11470;

// Prevent EIO errors in background/headless environments by pausing stdin
if (process.stdin.isTTY) {
  process.stdin.pause();
}

function getBridgeRuntimeInfo() {
  return {
    owner: process.env.STREAMER_BRIDGE_OWNER || "standalone",
    pid: process.pid,
    nodeVersion: process.version,
    nodeArch: process.env.STREAMER_BRIDGE_RUNTIME_ARCH || process.arch,
    nativeArch: process.env.STREAMER_BRIDGE_NATIVE_ARCH || undefined,
    processArch: process.arch,
    platform: process.platform,
  };
}

export function createStreamServerApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/cast", castRouter);
  app.use("/api/gateway", gatewayRouter);

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
      runtime: getBridgeRuntimeInfo(),
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

  app.get("/stream", requireBridgeAuth, streamRequest);

  app.get("/stats", requireBridgeAuth, async (_req, res) => {
    res.json(await getStats());
  });

  app.get("/api/torrent/:infoHash/metrics", requireBridgeAuth, metricsHandler);

  app.get("/api/subtitles", requireBridgeAuth, getSubtitlesRequest);
  app.get("/api/subtitles/:id/stream", streamSubtitleRequest);

  app.use("/api/handoff", handoffRouter);

  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      captureStreamServerException(err, {
        method: req.method,
        url: req.originalUrl,
      });
      console.error(
        "[stream-server] Unhandled route error:",
        redactSensitiveText(err.message),
      );

      if (res.headersSent) {
        return next(err);
      }

      return res.status(500).json({ error: "Internal bridge error" });
    },
  );

  return app;
}

export function startStreamServer(port: number | string = PORT) {
  initStreamServerSentry();
  const app = createStreamServerApp();
  const server = app.listen(Number(port), "0.0.0.0", () => {
    console.log(`Stream server (Bridge) running on http://0.0.0.0:${port}`);
  });
  server.on("error", (err: Error) => {
    captureStreamServerException(err, { component: "stream-server-listen" });
  });
  return server;
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  startStreamServer();
}
