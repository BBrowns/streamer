import express from "express";
import cors from "cors";
import { streamRequest, getClient } from "./torrent.js";
import { getStats } from "./stats.js";
import { castRouter } from "./cast.js";
import { metricsHandler } from "./metrics.js";

const app = express();
const PORT = process.env.PORT || 11470;

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

app.listen(PORT as number, "127.0.0.1", () => {
  console.log(`Stream server (Bridge) running on http://127.0.0.1:${PORT}`);
});
