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

export type BridgeStatus =
  | "available"
  | "unreachable"
  | "wrong-url"
  | "loading"
  | "no-peers"
  | "unsupported";
export type StreamingStrategy = "debrid" | "local";

export class StreamEngineManager {
  private engines: IStreamEngine[] = [];
  public activeStrategy: StreamingStrategy = "debrid";
  public bridgeUrl: string = resolveBridgeUrl();
  public bridgeAvailable: boolean = false;
  public bridgeStatus: BridgeStatus = "loading";
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
    const currentUrl = this.getBridgeUrl();
    this.bridgeStatus = "loading";

    try {
      const parsed = new URL(currentUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        this.bridgeAvailable = false;
        this.bridgeStatus = "wrong-url";
        return false;
      }
    } catch {
      this.bridgeAvailable = false;
      this.bridgeStatus = "wrong-url";
      return false;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${currentUrl}/api/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.torrentEngine?.available === false) {
          this.bridgeAvailable = false;
          this.bridgeStatus = "unsupported";
          return false;
        }
        this.bridgeAvailable = true;
        this.bridgeStatus = "available";
        this.activeStrategy = "local";
        // Stop retrying once connected
        if (this.retryTimer) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
        }
        return true;
      }
      this.bridgeAvailable = false;
      this.bridgeStatus = "unreachable";
    } catch {
      try {
        const fallbackController = new AbortController();
        const fallbackTimeout = setTimeout(
          () => fallbackController.abort(),
          2000,
        );
        const fallbackRes = await fetch(`${currentUrl}/status`, {
          signal: fallbackController.signal,
        }).finally(() => clearTimeout(fallbackTimeout));

        if (fallbackRes.ok) {
          this.bridgeAvailable = true;
          this.bridgeStatus = "available";
          this.activeStrategy = "local";
          if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
          }
          return true;
        }
      } catch {
        // fall through to unreachable state
      }

      this.bridgeAvailable = false;
      this.bridgeStatus = "unreachable";
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

  getBridgeUrl(): string {
    const { streamServerUrl } = useAuthStore.getState();
    this.bridgeUrl = streamServerUrl || resolveBridgeUrl();
    return this.bridgeUrl;
  }

  async getPlaybackUri(stream: Stream): Promise<string | null> {
    const engine = this.resolveEngine(stream);
    if (!engine) return null;

    this.getBridgeUrl();

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
