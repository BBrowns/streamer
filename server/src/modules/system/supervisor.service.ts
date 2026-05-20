import { spawn, ChildProcess } from "child_process";
import path from "path";
import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";

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

  public start() {
    if (this.child) return;
    this.isStopping = false;
    this.spawn();
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

    this.child.on("exit", (code, signal) => {
      this.child = null;
      if (!this.isStopping) {
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

        setTimeout(() => this.spawn(), delay);
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
