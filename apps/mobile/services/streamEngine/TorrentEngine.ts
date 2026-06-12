import type { Stream } from "@streamer/shared";
import type {
  AudioTrack,
  GatewayJobProgress,
  IStreamEngine,
  SubtitleTrack,
  StreamStats,
} from "./IStreamEngine";
import { api } from "../api";
import { getBridgeAuthHeaders, withBridgeJsonHeaders } from "../bridgeAuth";

type GatewayJobState =
  | "preparing"
  | "ready"
  | "no_peers"
  | "stalled"
  | "error"
  | "cancelled"
  | "expired";

interface GatewayJobResponse extends GatewayJobProgress {
  id?: string;
  state?: GatewayJobState;
  playbackUrl?: string;
  error?: string;
  readyTimeoutMs?: number;
}

const DEFAULT_GATEWAY_JOB_READY_TIMEOUT_MS = 45_000;
const GATEWAY_JOB_POLL_INTERVAL_MS = 1_000;

interface BridgeConfig {
  activeStrategy: string;
  bridgeAvailable: boolean;
  bridgeUrl: string;
  bridgeStatus: string;
  getBridgeUrl?: () => string;
}

function toAbsoluteBridgeUrl(bridgeUrl: string, path: string) {
  return new URL(path, bridgeUrl.endsWith("/") ? bridgeUrl : `${bridgeUrl}/`)
    .href;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TorrentEngine implements IStreamEngine {
  private listeners = new Map<string, Set<Function>>();
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private activeGatewayJob: { bridgeUrl: string; id: string } | null = null;
  private bridge: BridgeConfig;

  constructor(bridge: BridgeConfig) {
    this.bridge = bridge;
  }

  canPlay(stream: Stream): boolean {
    // Only claim we can play it if it's an infohash torrent
    return !!stream.infoHash;
  }

  async getPlaybackUri(stream: Stream): Promise<string> {
    // 1. Try to resolve via Backend (Real-Debrid Fallback)
    try {
      const { data } = await api.get(
        `/api/stream/resolve/${stream.type || "movie"}/${stream.id || stream.infoHash}/${stream.infoHash}`,
      );
      if (
        data.resolved &&
        data.resolved.url &&
        data.resolved.type !== "magnet"
      ) {
        console.log("[TorrentEngine] Resolved via Debrid");
        return data.resolved.url;
      }
    } catch (e) {
      console.warn(
        "[TorrentEngine] Debrid resolution failed, falling back to local bridge",
      );
    }

    // 2. Fallback to Local Bridge (stream-server)
    const bridgeUrl = this.bridge.getBridgeUrl?.() ?? this.bridge.bridgeUrl;
    if (
      this.bridge.activeStrategy === "local" &&
      this.bridge.bridgeAvailable &&
      this.bridge.bridgeStatus === "available"
    ) {
      // Build the magnet link or infohash to send to the bridge
      let magnet = `magnet:?xt=urn:btih:${stream.infoHash}`;

      // Append default trackers directly to the magnet link
      const trackers = [
        "http://tracker.opentrackr.org:1337/announce",
        "http://tracker.renhas.cl:6969/announce",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://tracker.internetwarriors.net:1337/announce",
        "udp://tracker.leechers-paradise.org:6969/announce",
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.btorrent.xyz",
        "wss://tracker.fastcast.nz",
      ];
      for (const tr of trackers) {
        magnet += `&tr=${encodeURIComponent(tr)}`;
      }

      this.startStatsPolling();
      await this.cancelActiveGatewayJob();
      this.emit("gateway", {
        state: "preparing",
        phase: "creating_gateway_job",
        progress: 0,
        peerCount: null,
      } satisfies GatewayJobProgress);
      const gatewayRes = await fetch(`${bridgeUrl}/api/gateway/jobs`, {
        method: "POST",
        headers: withBridgeJsonHeaders(),
        body: JSON.stringify({
          magnet,
          fileIdx: stream.fileIdx,
          fileSelectionHints: stream.fileSelectionHints,
          remux: stream.behaviorHints?.remuxToMp4 ? "mp4" : undefined,
        }),
      });

      if (!gatewayRes.ok) {
        const body = await gatewayRes.json().catch(() => null);
        throw new Error(
          body?.error || `Stream gateway unavailable (${gatewayRes.status})`,
        );
      }

      const job = (await gatewayRes.json()) as GatewayJobResponse;
      if (!job?.playbackUrl) {
        throw new Error("Stream gateway did not return a playback URL");
      }
      if (job.id) {
        this.activeGatewayJob = { bridgeUrl, id: job.id };
      }
      this.emit("gateway", job);

      const readyJob = await this.waitForGatewayJobReady(bridgeUrl, job);
      this.emit("gateway", readyJob);
      return toAbsoluteBridgeUrl(bridgeUrl, readyJob.playbackUrl!);
    }

    return "";
  }

  private async waitForGatewayJobReady(
    bridgeUrl: string,
    initialJob: GatewayJobResponse,
  ): Promise<GatewayJobResponse> {
    if (initialJob.state === "ready" || !initialJob.state) {
      return initialJob;
    }

    if (initialJob.state === "error") {
      this.markBridgeNoPeersIfRelevant(initialJob.error);
      throw new Error(initialJob.error || "Stream gateway could not prepare");
    }

    if (initialJob.state === "no_peers") {
      this.bridge.bridgeStatus = "no-peers";
      throw new Error(initialJob.error || "No peers found.");
    }

    if (initialJob.state === "stalled") {
      throw new Error(
        initialJob.error ||
          "Stream gateway stalled while preparing this source.",
      );
    }

    if (initialJob.state === "cancelled") {
      if (this.activeGatewayJob?.id !== initialJob.id) {
        return initialJob;
      }
      throw new Error(initialJob.error || "Stream gateway job was cancelled");
    }

    if (!initialJob.id) {
      return initialJob;
    }

    const statusUrl = toAbsoluteBridgeUrl(
      bridgeUrl,
      `/api/gateway/jobs/${encodeURIComponent(initialJob.id)}`,
    );
    const timeoutMs =
      typeof initialJob.readyTimeoutMs === "number"
        ? initialJob.readyTimeoutMs + GATEWAY_JOB_POLL_INTERVAL_MS
        : DEFAULT_GATEWAY_JOB_READY_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const statusRes = await fetch(statusUrl, {
          headers: getBridgeAuthHeaders(),
        });

        if (!statusRes.ok) {
          throw new Error(
            `Stream gateway status unavailable (${statusRes.status})`,
          );
        }

        const job = (await statusRes.json()) as GatewayJobResponse;
        this.emit("gateway", job);
        if (job.state === "ready" && job.playbackUrl) {
          return job;
        }

        if (job.state === "error") {
          this.markBridgeNoPeersIfRelevant(job.error);
          const err = new Error(
            job.error || "Stream gateway could not prepare",
          );
          (err as any).isTerminal = true;
          throw err;
        }

        if (job.state === "no_peers") {
          this.bridge.bridgeStatus = "no-peers";
          const err = new Error(job.error || "No peers found.");
          (err as any).isTerminal = true;
          throw err;
        }

        if (job.state === "stalled") {
          const err = new Error(
            job.error || "Stream gateway stalled while preparing this source.",
          );
          (err as any).isTerminal = true;
          throw err;
        }

        if (job.state === "cancelled") {
          // If this is no longer the active job (i.e. superseded by a new one), silence the error
          if (this.activeGatewayJob?.id !== initialJob.id) {
            return job;
          }
          const err = new Error(
            job.error || "Stream gateway job was cancelled",
          );
          (err as any).isTerminal = true;
          throw err;
        }
      } catch (err: any) {
        // If it's a terminal error (intentional throw above) or a specific known terminal condition, rethrow it
        if (
          err.isTerminal ||
          err.message?.includes("cancelled") ||
          err.message?.includes("prepare")
        ) {
          throw err;
        }

        // Specific test support: if fetch mock was problematic
        if (!err.message) {
          throw err;
        }

        // Otherwise, log and retry (bridge might be rebooting or network might be shaky)
        console.warn(
          "[TorrentEngine] Transient fetch error during polling:",
          err.message,
        );
      }

      await sleep(GATEWAY_JOB_POLL_INTERVAL_MS);
    }

    this.bridge.bridgeStatus = "no-peers";
    await this.cancelActiveGatewayJob();
    throw new Error(
      "Still waiting for torrent peers. Try again shortly or choose another source.",
    );
  }

  private markBridgeNoPeersIfRelevant(message?: string) {
    if (!message) return;
    if (/peer|timeout|metadata/i.test(message)) {
      this.bridge.bridgeStatus = "no-peers";
    }
  }

  private startStatsPolling() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    this.statsInterval = setInterval(async () => {
      if (!this.bridge.bridgeAvailable) return;
      try {
        const bridgeUrl = this.bridge.getBridgeUrl?.() ?? this.bridge.bridgeUrl;
        const res = await fetch(`${bridgeUrl}/stats`);
        if (res.ok) {
          const stats: StreamStats = await res.json();
          this.emit("stats", stats);
        }
      } catch (e: any) {
        const bridgeUrl = this.bridge.getBridgeUrl?.() ?? this.bridge.bridgeUrl;
        console.warn(
          `[TorrentEngine] Bridge unreachable (${bridgeUrl}):`,
          e?.message || e,
        );
      }
    }, 2000); // poll every 2 seconds
  }

  private async cancelActiveGatewayJob() {
    const activeJob = this.activeGatewayJob;
    if (!activeJob) return;

    this.activeGatewayJob = null;
    try {
      await fetch(
        toAbsoluteBridgeUrl(
          activeJob.bridgeUrl,
          `/api/gateway/jobs/${encodeURIComponent(activeJob.id)}`,
        ),
        {
          method: "DELETE",
          headers: getBridgeAuthHeaders(),
        },
      );
      this.emit("gateway", {
        id: activeJob.id,
        state: "cancelled",
        phase: "cancelled",
        progress: null,
      } satisfies GatewayJobProgress);
    } catch (error: any) {
      console.warn(
        "[TorrentEngine] Failed to cancel gateway job:",
        error?.message || error,
      );
    }
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => cb(data));
    }
  }

  getEngineType(): string {
    return "torrent";
  }

  // Pass-through track stubs
  getAudioTracks(): AudioTrack[] {
    return [];
  }
  setAudioTrack(id: string): void {}
  getSubtitles(): SubtitleTrack[] {
    return [];
  }
  setSubtitle(id: string | null): void {}

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  stop(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    void this.cancelActiveGatewayJob();
    this.listeners.clear();
  }
}
