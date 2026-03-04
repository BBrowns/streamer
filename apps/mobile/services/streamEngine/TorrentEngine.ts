import type { Stream } from "@streamer/shared";
import type {
  AudioTrack,
  IStreamEngine,
  SubtitleTrack,
  StreamStats,
} from "./IStreamEngine";
import { api } from "../api";

interface BridgeConfig {
  activeStrategy: string;
  bridgeAvailable: boolean;
  bridgeUrl: string;
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
    if (this.bridge.activeStrategy === "local" && this.bridge.bridgeAvailable) {
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
      return `${this.bridge.bridgeUrl}/stream?magnet=${encodeURIComponent(magnet)}`;
    }

    return "";
  }

  private startStatsPolling() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    this.statsInterval = setInterval(async () => {
      if (!this.bridge.bridgeAvailable) return;
      try {
        const res = await fetch(`${this.bridge.bridgeUrl}/stats`);
        if (res.ok) {
          const stats: StreamStats = await res.json();
          this.emit("stats", stats);
        }
      } catch (e) {
        console.warn("Failed to fetch torrent stats from bridge", e);
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
