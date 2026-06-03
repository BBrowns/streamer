import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";

const BRIDGE_HEALTH_URL =
  process.env.STREAMER_BRIDGE_HEALTH_URL || "http://127.0.0.1:11470/api/health";
const BRIDGE_CLAIM_FILE =
  process.env.STREAMER_BRIDGE_CLAIM_FILE ||
  path.join(os.tmpdir(), "streamer-bridge-owner.json");
const DESKTOP_CLAIM_MAX_AGE_MS = Number(
  process.env.STREAMER_BRIDGE_CLAIM_MAX_AGE_MS || "30000",
);
const BRIDGE_PROBE_ATTEMPTS = Number(
  process.env.STREAMER_BRIDGE_SUPERVISOR_PROBE_ATTEMPTS || "6",
);
const BRIDGE_PROBE_DELAY_MS = Number(
  process.env.STREAMER_BRIDGE_SUPERVISOR_PROBE_DELAY_MS || "500",
);

type BridgeOwnerClaim = {
  owner?: string;
  pid?: number;
  port?: number;
  updatedAt?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Supervisor Service
 * Manages the lifecycle of the stream-server child process.
 * Provides automatic restarts and log aggregation.
 */
class SupervisorService {
  private child: ChildProcess | null = null;
  private isStopping = false;
  private restartCount = 0;
  private lastRestart = 0;

  public async start() {
    if (this.child) return;
    this.isStopping = false;

    if (await this.shouldYieldToExternalBridge("startup")) {
      return;
    }

    this.spawn();
  }

  private readFreshDesktopClaim(): BridgeOwnerClaim | null {
    try {
      if (!fs.existsSync(BRIDGE_CLAIM_FILE)) return null;
      const claim = JSON.parse(
        fs.readFileSync(BRIDGE_CLAIM_FILE, "utf8"),
      ) as BridgeOwnerClaim;
      if (claim.owner !== "desktop") return null;

      const updatedAt = Number(claim.updatedAt || 0);
      if (!updatedAt || Date.now() - updatedAt > DESKTOP_CLAIM_MAX_AGE_MS) {
        return null;
      }

      if (
        Number.isInteger(claim.pid) &&
        claim.pid &&
        !isProcessAlive(claim.pid)
      ) {
        return null;
      }

      return claim;
    } catch {
      return null;
    }
  }

  private async probeBridgeHealth() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);

    try {
      const res = await fetch(BRIDGE_HEALTH_URL, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return await res.json().catch(() => ({}));
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async shouldYieldToExternalBridge(reason: "startup" | "restart") {
    const desktopClaim = this.readFreshDesktopClaim();
    if (desktopClaim) {
      logger.info(
        { reason, claim: desktopClaim },
        "[supervisor] Desktop bridge is claiming port 11470; skipping spawn.",
      );
      return true;
    }

    for (let attempt = 1; attempt <= BRIDGE_PROBE_ATTEMPTS; attempt++) {
      const health = await this.probeBridgeHealth();
      if (health) {
        const owner =
          (health as { runtime?: { owner?: string } }).runtime?.owner ||
          "unknown";
        logger.info(
          { reason, owner, attempt },
          "[supervisor] Bridge already running on 11470; skipping spawn.",
        );
        return true;
      }

      if (attempt < BRIDGE_PROBE_ATTEMPTS) {
        await sleep(BRIDGE_PROBE_DELAY_MS);
      }
    }

    return false;
  }

  private spawn() {
    const isDev = env.nodeEnv === "development";

    // Calculate path relative to the monorepo root
    // server/src/modules/system -> server/
    const serverDir = path.resolve(process.cwd());
    const monorepoRoot = path.resolve(serverDir, "..");

    const streamServerDir = path.join(monorepoRoot, "packages/stream-server");
    const entryPath = isDev
      ? path.join(streamServerDir, "src/index.ts")
      : path.join(streamServerDir, "dist/index.js");

    const command = isDev ? "npx" : "node";
    const args = isDev ? ["tsx", entryPath] : [entryPath];

    logger.info(
      { command, args, cwd: streamServerDir },
      "[supervisor] Spawning stream-server",
    );

    this.child = spawn(command, args, {
      cwd: streamServerDir,
      stdio: "pipe",
      env: {
        ...process.env,
        PORT: "11470",
        NODE_ENV: env.nodeEnv,
        STREAMER_BRIDGE_OWNER: "server-supervisor",
        STREAMER_BRIDGE_CLAIM_FILE: BRIDGE_CLAIM_FILE,
      },
    });

    this.child.stdout?.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) logger.info({ component: "stream-server" }, msg);
    });

    this.child.stderr?.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) logger.error({ component: "stream-server" }, msg);
    });

    this.child.on("error", (err) => {
      logger.error({ err }, "[supervisor] stream-server spawn error");
    });

    this.child.on("exit", async (code, signal) => {
      this.child = null;
      if (!this.isStopping) {
        if (await this.shouldYieldToExternalBridge("restart")) {
          return;
        }

        const now = Date.now();
        // Simple backoff / throttle
        if (now - this.lastRestart < 5000) {
          this.restartCount++;
        } else {
          this.restartCount = 0;
        }

        const delay = Math.min(1000 * Math.pow(2, this.restartCount), 30000);
        this.lastRestart = now;

        logger.warn(
          { code, signal, nextAttemptIn: `${delay}ms` },
          "[supervisor] stream-server exited unexpectedly. Restarting...",
        );

        setTimeout(() => {
          void this.shouldYieldToExternalBridge("restart").then(
            (shouldYield) => {
              if (!shouldYield && !this.isStopping) {
                this.spawn();
              }
            },
          );
        }, delay);
      } else {
        logger.info("[supervisor] stream-server stopped successfully");
      }
    });
  }

  public stop() {
    logger.info("[supervisor] Stopping stream-server...");
    this.isStopping = true;
    if (this.child) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
  }
}

export const supervisorService = new SupervisorService();
