import type { Stream } from "@streamer/shared";
import type { IStreamEngine } from "./IStreamEngine";
import { HLSEngine } from "./HLSEngine";
import { HttpVideoEngine } from "./HttpVideoEngine";
import { TorrentEngine } from "./TorrentEngine";

export type StreamingStrategy = "debrid" | "local";

export class StreamEngineManager {
  private engines: IStreamEngine[] = [];
  public activeStrategy: StreamingStrategy = "debrid";
  public bridgeUrl: string = "http://127.0.0.1:11470";
  public bridgeAvailable: boolean = false;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.registerEngine(new HLSEngine());
    this.registerEngine(new HttpVideoEngine());
    this.registerEngine(new TorrentEngine(this));

    // Probe for bridge, retry periodically if not found
    this.detectBridge();
  }

  async detectBridge(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.bridgeUrl}/status`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        this.bridgeAvailable = true;
        this.activeStrategy = "local";
        // Stop retrying once connected
        if (this.retryTimer) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
        }
        return true;
      }
    } catch {
      this.bridgeAvailable = false;
    }

    // Schedule retries every 5s until bridge comes online
    if (!this.retryTimer) {
      this.retryTimer = setInterval(() => {
        this.detectBridge();
      }, 5000);
    }

    return false;
  }

  registerEngine(engine: IStreamEngine): void {
    this.engines.push(engine);
  }

  resolveEngine(stream: Stream): IStreamEngine | null {
    return this.engines.find((e) => e.canPlay(stream)) ?? null;
  }

  getPlaybackUri(stream: Stream): string | null {
    const engine = this.resolveEngine(stream);
    return engine ? engine.getPlaybackUri(stream) : null;
  }
}

// Singleton instance
export const streamEngineManager = new StreamEngineManager();
