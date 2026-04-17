import type { Stream } from "@streamer/shared";
import type { IStreamEngine } from "./IStreamEngine";
import { HLSEngine } from "./HLSEngine";
import { HttpVideoEngine } from "./HttpVideoEngine";
import { TorrentEngine } from "./TorrentEngine";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useAuthStore } from "../../stores/authStore";

/**
 * Resolve the stream-server bridge URL dynamically so it works on
 * Simulator, real iOS devices over Wi-Fi, and Android emulators.
 */
function resolveBridgeUrl(): string {
  if (Platform.OS === "web") {
    return "http://localhost:11470";
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:11470";
  }

  // iOS: derive IP from the Metro bundler host Expo already knows about
  const metroHost = Constants.expoConfig?.hostUri;
  if (metroHost) {
    const ip = metroHost.split(":")[0];
    return `http://${ip}:11470`;
  }

  return "http://localhost:11470";
}

export type StreamingStrategy = "debrid" | "local";

export class StreamEngineManager {
  private engines: IStreamEngine[] = [];
  public activeStrategy: StreamingStrategy = "debrid";
  public bridgeUrl: string = resolveBridgeUrl();
  public bridgeAvailable: boolean = false;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.registerEngine(new HLSEngine());
    this.registerEngine(new HttpVideoEngine());
    this.registerEngine(new TorrentEngine(this));

    // Probe for bridge, retry periodically if not found
    if (process.env.NODE_ENV !== "test") {
      this.detectBridge();
    }
  }

  async detectBridge(): Promise<boolean> {
    const { streamServerUrl } = useAuthStore.getState();
    const currentUrl = streamServerUrl || this.bridgeUrl;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${currentUrl}/status`, {
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

  async getPlaybackUri(stream: Stream): Promise<string | null> {
    const engine = this.resolveEngine(stream);
    if (!engine) return null;

    // Inject dynamic bridge URL into engines that need it (like TorrentEngine)
    if ("bridgeUrl" in engine) {
      const { streamServerUrl } = useAuthStore.getState();
      (engine as any).bridgeUrl = streamServerUrl || this.bridgeUrl;
    }

    return await engine.getPlaybackUri(stream);
  }

  destroy(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    // Any other cleanup for engines that might have timers
    this.engines.forEach((e) => {
      if ("stop" in e && typeof e.stop === "function") {
        e.stop();
      }
      if ("destroy" in e && typeof e.destroy === "function") {
        e.destroy();
      }
    });
  }
}

// Singleton instance
export const streamEngineManager = new StreamEngineManager();
