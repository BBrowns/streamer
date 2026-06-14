import express from "express";
import cors from "cors";
import { pathToFileURL } from "url";
import {
  streamRequest,
  getClient,
  getRemuxCacheStatus,
  getRemuxRuntimeStatus,
  getTorrentEngineStatus,
} from "./torrent.js";
import { getStats } from "./stats.js";
import { castRouter } from "./cast.js";
import { metricsHandler } from "./metrics.js";
import { getSubtitlesRequest, streamSubtitleRequest } from "./subtitles.js";
import { handoffRouter } from "./handoff.js";
import { gatewayRouter } from "./gateway.js";
import { requireBridgeAuth } from "./security.js";
import { redactSensitiveText } from "./redaction.js";
import { streamServerBuildMetadata } from "./build-metadata.js";
import {
  captureStreamServerException,
  initStreamServerSentry,
} from "./sentry.js";

const PORT = process.env.PORT || 11470;

// Prevent EIO errors in background/headless environments by pausing stdin
if (process.stdin.isTTY) {
  process.stdin.pause();
}

type BridgeHealthCheckStatus = "pass" | "warn" | "fail";

interface BridgeHealthCheck {
  name: string;
  status: BridgeHealthCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

interface BridgeRepairPlan {
  required: boolean;
  reason?: string;
  title?: string;
  detail?: string;
  actionLabel?: string;
  steps?: string[];
}

function getBridgeRuntimeInfo() {
  const nodeArch = process.env.STREAMER_BRIDGE_RUNTIME_ARCH || process.arch;
  const nativeArch = process.env.STREAMER_BRIDGE_NATIVE_ARCH || undefined;

  return {
    owner: process.env.STREAMER_BRIDGE_OWNER || "standalone",
    pid: process.pid,
    nodeVersion: process.version,
    nodeArch,
    nativeArch,
    processArch: process.arch,
    platform: process.platform,
    architectureMismatch: Boolean(nativeArch && nodeArch !== nativeArch),
  };
}

function repairPlanForReason(reason?: string): BridgeRepairPlan {
  switch (reason) {
    case "native-architecture-mismatch":
      return {
        required: true,
        reason,
        title: "Bridge runtime architecture mismatch",
        detail:
          "The bridge is using a Node runtime that does not match the native torrent module architecture.",
        actionLabel: "Repair runtime",
        steps: [
          "Install or select a Node.js runtime that matches the node-datachannel native binary architecture.",
          "If you are on Apple Silicon, prefer an arm64 Node.js install.",
          "If you intentionally use another runtime, set STREAMER_BRIDGE_NODE to the matching Node binary.",
          "Restart the desktop app after changing Node or rebuilding dependencies.",
        ],
      };
    case "native-load-failed":
      return {
        required: true,
        reason,
        title: "Native torrent module failed to load",
        detail:
          "The torrent engine cannot load node-datachannel. Reinstall or rebuild desktop dependencies for this machine.",
        actionLabel: "Rebuild dependencies",
        steps: [
          "Stop the desktop app.",
          "Reinstall dependencies from the repository root.",
          "Rebuild or reinstall node-datachannel for the current runtime.",
          "Restart the desktop app and run the bridge self-test again.",
        ],
      };
    case "missing-stream-server-build":
      return {
        required: true,
        reason,
        title: "Stream bridge build is missing",
        detail:
          "The desktop shell cannot find the packaged stream-server entrypoint.",
        actionLabel: "Build bridge",
        steps: [
          "Run npm run build --workspace=@streamer/stream-server.",
          "Restart the desktop app.",
          "For packaged builds, verify that the stream-server dist files are included as desktop resources.",
        ],
      };
    case "bridge-port-owned-by-other-process":
      return {
        required: true,
        reason,
        title: "Bridge port is already in use",
        detail:
          "Another process owns port 11470, so the desktop bridge cannot fully start.",
        actionLabel: "Reclaim port",
        steps: [
          "Close other Streamer instances.",
          "Restart the desktop app.",
          "If the issue remains, stop the process using port 11470 and try again.",
        ],
      };
    default:
      return {
        required: false,
      };
  }
}

function buildBridgeSelfTest(input: {
  runtime: ReturnType<typeof getBridgeRuntimeInfo>;
  torrentEngine: ReturnType<typeof getTorrentEngineStatus>;
  remuxRuntime: Awaited<ReturnType<typeof getRemuxRuntimeStatus>>;
  engineCheckErrorMessage?: string;
}) {
  const { runtime, torrentEngine, remuxRuntime, engineCheckErrorMessage } =
    input;
  const repairReason =
    torrentEngine.available === false
      ? torrentEngine.reason || "torrent-engine-unavailable"
      : runtime.architectureMismatch
        ? "native-architecture-mismatch"
        : undefined;
  const repair = repairPlanForReason(repairReason);

  const checks: BridgeHealthCheck[] = [
    {
      name: "runtime",
      status: runtime.architectureMismatch ? "fail" : "pass",
      message: runtime.architectureMismatch
        ? `Node runtime architecture ${runtime.nodeArch} does not match native module architecture ${runtime.nativeArch}.`
        : "Node runtime architecture matches the detected native module architecture.",
      details: {
        nodeArch: runtime.nodeArch,
        nativeArch: runtime.nativeArch,
        processArch: runtime.processArch,
        platform: runtime.platform,
      },
    },
    {
      name: "torrent-engine",
      status: torrentEngine.available ? "pass" : "fail",
      message: torrentEngine.available
        ? `Torrent engine is ${torrentEngine.state}.`
        : torrentEngine.message ||
          engineCheckErrorMessage ||
          "Torrent engine is unavailable.",
      details: {
        state: torrentEngine.state,
        reason: torrentEngine.reason,
        processArch: torrentEngine.processArch,
        platform: torrentEngine.platform,
      },
    },
    {
      name: "ffmpeg-remux",
      status: remuxRuntime.available ? "pass" : "warn",
      message: remuxRuntime.available
        ? `FFmpeg remux runtime is ready${
            remuxRuntime.version ? ` (${remuxRuntime.version})` : ""
          }.`
        : remuxRuntime.message ||
          "FFmpeg remux runtime is unavailable. MKV remux playback may be unsupported.",
      details: {
        state: remuxRuntime.state,
        reason: remuxRuntime.reason,
        binaryPath: remuxRuntime.binaryPath,
        processArch: remuxRuntime.processArch,
        platform: remuxRuntime.platform,
      },
    },
    {
      name: "gateway-readiness",
      status: "pass",
      message:
        "Gateway readiness waits for remux cache materialization or first-byte torrent readability before reporting ready.",
      details: {
        remuxReadiness: "cache-before-ready",
        bridgeReadiness: "first-byte-before-ready",
      },
    },
  ];

  const status: BridgeHealthCheckStatus = checks.some(
    (check) => check.status === "fail",
  )
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass";

  return {
    selfTest: {
      status,
      checkedAt: Date.now(),
      summary:
        status === "pass"
          ? "Bridge runtime self-test passed."
          : "Bridge runtime self-test found an issue.",
      checks,
    },
    repair,
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
    let engineCheckErrorMessage: string | undefined;

    try {
      const client = await getClient();
      torrentCount = client.torrents?.length ?? 0;
    } catch (error) {
      engineCheckErrorMessage =
        error instanceof Error ? error.message : String(error);
    }

    const runtime = getBridgeRuntimeInfo();
    const torrentEngine = getTorrentEngineStatus();
    const remuxRuntime = await getRemuxRuntimeStatus();
    const remuxCache = getRemuxCacheStatus();
    const { selfTest, repair } = buildBridgeSelfTest({
      runtime,
      torrentEngine,
      remuxRuntime,
      engineCheckErrorMessage,
    });

    res.json({
      status: "active",
      torrentEngine,
      remuxRuntime,
      remuxCache,
      runtime,
      selfTest,
      repair,
      version: streamServerBuildMetadata.appVersion,
      build: streamServerBuildMetadata,
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
    res.json({
      status: "active",
      version: streamServerBuildMetadata.appVersion,
      build: streamServerBuildMetadata,
    });
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
    console.log(
      JSON.stringify({
        service: "streamer-stream-server",
        event: "started",
        port: Number(port),
        build: streamServerBuildMetadata,
      }),
    );
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
