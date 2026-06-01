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
    // Android emulator's special alias for host loopback
    return "http://10.0.2.2:11470";
  }

  // iOS: check if we're on a simulator. If so, localhost is usually preferred.
  // We can detect simulator by checking if hostUri includes "localhost" or "127.0.0.1"
  // or by checking for the absence of a real LAN IP.
  const metroHost = Constants.expoConfig?.hostUri;
  if (metroHost) {
    const ip = metroHost.split(":")[0];
    if (ip === "localhost" || ip === "127.0.0.1") {
      return "http://localhost:11470";
    }
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
    const urlsToTry = new Set<string>();
    const defaultUrl = this.getBridgeUrl();
    urlsToTry.add(defaultUrl);

    // Fallbacks for simulators/local usage
    if (Platform.OS === "web" || Platform.OS === "ios") {
      urlsToTry.add("http://localhost:11470");
      urlsToTry.add("http://127.0.0.1:11470");
    } else if (Platform.OS === "android") {
      urlsToTry.add("http://10.0.2.2:11470");
    }

    console.log(
      "[StreamEngineManager] Detecting bridge. Trying URLs:",
      Array.from(urlsToTry),
    );
    this.bridgeStatus = "loading";

    for (const url of urlsToTry) {
      const { status } = await this.probeBridge(url);
      console.log(`[StreamEngineManager] Probe ${url}: ${status}`);

      if (status === "available") {
        this.bridgeUrl = url;
        this.bridgeAvailable = true;
        this.bridgeStatus = "available";
        this.activeStrategy = "local";

        if (this.retryTimer) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
        }
        return true;
      }

      if (status === "unsupported") {
        this.bridgeStatus = "unsupported";
      }
    }

    this.bridgeAvailable = false;
    if (this.bridgeStatus !== "unsupported") {
      this.bridgeStatus = "unreachable";
    }
    console.warn(
      "[StreamEngineManager] Bridge unreachable after trying all fallbacks.",
    );

    // Schedule retries if not already scheduled
    if (!this.retryTimer) {
      this.retryTimer = setInterval(() => {
        this.detectBridge();
      }, 5000);
    }

    return false;
  }

  private async probeBridge(url: string): Promise<{ status: BridgeStatus }> {
    try {
      new URL(url);
    } catch {
      return { status: "wrong-url" };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${url}/api/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.torrentEngine?.available === false) {
          return { status: "unsupported" };
        }
        return { status: "available" };
      }
    } catch {
      // Fallback to legacy status check
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${url}/status`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        return { status: res.ok ? "available" : "unreachable" };
      } catch {
        return { status: "unreachable" };
      }
    }
    return { status: "unreachable" };
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
