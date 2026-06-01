import type { Stream } from "@streamer/shared";
import type {
  AudioTrack,
  IStreamEngine,
  SubtitleTrack,
  StreamStats,
} from "./IStreamEngine";
import { api } from "../api";
import { getBridgeAuthHeaders, withBridgeJsonHeaders } from "../bridgeAuth";

type GatewayJobState = "preparing" | "ready" | "error";

interface GatewayJobResponse {
  id?: string;
  state?: GatewayJobState;
  playbackUrl?: string;
  error?: string;
}

const GATEWAY_JOB_READY_TIMEOUT_MS = 45_000;
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
        console.log("[TorrentEngine] Resolved via Debrid:", data.resolved.url);
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
      const gatewayRes = await fetch(`${bridgeUrl}/api/gateway/jobs`, {
        method: "POST",
        headers: withBridgeJsonHeaders(),
        body: JSON.stringify({
          magnet,
          fileIdx: stream.fileIdx,
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

      const readyJob = await this.waitForGatewayJobReady(bridgeUrl, job);
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

    if (!initialJob.id) {
      return initialJob;
    }

    const statusUrl = toAbsoluteBridgeUrl(
      bridgeUrl,
      `/api/gateway/jobs/${encodeURIComponent(initialJob.id)}`,
    );
    const deadline = Date.now() + GATEWAY_JOB_READY_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const statusRes = await fetch(statusUrl, {
        headers: getBridgeAuthHeaders(),
      });

      if (!statusRes.ok) {
        throw new Error(
          `Stream gateway status unavailable (${statusRes.status})`,
        );
      }

      const job = (await statusRes.json()) as GatewayJobResponse;
      if (job.state === "ready" && job.playbackUrl) {
        return job;
      }

      if (job.state === "error") {
        this.markBridgeNoPeersIfRelevant(job.error);
        throw new Error(job.error || "Stream gateway could not prepare");
      }

      await sleep(GATEWAY_JOB_POLL_INTERVAL_MS);
    }

    this.bridge.bridgeStatus = "no-peers";
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
    this.listeners.clear();
  }
}
