import { validateActionBridgeUrl } from "@streamer/shared";
import type { ActionBridgeCapabilities, Stream } from "@streamer/shared";
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

export function validateBridgeUrl(rawUrl: string | null | undefined): {
  ok: boolean;
  url?: string;
  reason?: string;
} {
  const result = validateActionBridgeUrl(rawUrl);
  return result.ok
    ? { ok: true, url: result.url }
    : { ok: false, reason: result.reason };
}

export type BridgeStatus =
  | "available"
  | "unreachable"
  | "wrong-url"
  | "loading"
  | "no-peers"
  | "unsupported";

export type StreamingStrategy = "debrid" | "local";

export type BridgeSelfTestStatus = "pass" | "warn" | "fail";

export interface BridgeSelfTestCheck {
  name: string;
  status: BridgeSelfTestStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface BridgeSelfTest {
  status: BridgeSelfTestStatus;
  checkedAt?: number;
  summary?: string;
  checks?: BridgeSelfTestCheck[];
}

export interface BridgeRepairPlan {
  required: boolean;
  reason?: string;
  title?: string;
  detail?: string;
  actionLabel?: string;
  steps?: string[];
}

export interface BridgeDiagnostics {
  status: BridgeStatus;
  url?: string;
  reason?: string;
  message?: string;
  processArch?: string;
  runtimeArch?: string;
  nativeArch?: string;
  platform?: string;
  selfTest?: BridgeSelfTest;
  repair?: BridgeRepairPlan;
  auth?: {
    required?: boolean;
    configured?: boolean;
  };
  capabilities?: ActionBridgeCapabilities;
  remuxRuntime?: {
    available?: boolean;
    state?: string;
    binaryPath?: string;
    version?: string;
    reason?: string;
    message?: string;
    processArch?: string;
    platform?: string;
  };
  remuxCache?: {
    entryCount?: number;
    pendingCount?: number;
    totalBytes?: number;
    maxBytes?: number;
    ttlMs?: number;
  };
  torrentCache?: {
    rootDir?: string;
    entryCount?: number;
    totalBytes?: number;
    maxBytes?: number;
    ttlMs?: number;
  };
  checkedAt?: number;
}

interface BridgeProbeResult extends BridgeDiagnostics {}

export class StreamEngineManager {
  private engines: IStreamEngine[] = [];
  public activeStrategy: StreamingStrategy = "debrid";
  public bridgeUrl: string = resolveBridgeUrl();
  public bridgeAvailable: boolean = false;
  public bridgeStatus: BridgeStatus = "loading";
  public bridgeDiagnostics: BridgeDiagnostics = {
    status: "loading",
    url: this.bridgeUrl,
  };
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.registerEngine(new HLSEngine());
    this.registerEngine(new HttpVideoEngine());
    this.registerEngine(new TorrentEngine(this));

    // Expo Router renders web routes on the server before browser hydration.
    // The local bridge is a device concern, so only probe from a real client.
    const canProbeFromRuntime =
      Platform.OS !== "web" || typeof window !== "undefined";
    if (process.env.NODE_ENV !== "test" && canProbeFromRuntime) {
      this.detectBridge();
    }
  }

  async detectBridge(): Promise<boolean> {
    const urlsToTry = new Set<string>();
    const defaultUrl = this.getBridgeUrl();
    if (!defaultUrl) {
      this.bridgeAvailable = false;
      this.bridgeStatus = "wrong-url";
      this.bridgeDiagnostics = {
        status: "wrong-url",
        reason: "invalid-url",
        message: "Bridge URL is not trusted.",
        checkedAt: Date.now(),
      };
      return false;
    }
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
    this.bridgeDiagnostics = {
      status: "loading",
      url: defaultUrl,
      checkedAt: Date.now(),
    };
    let unsupportedProbe: BridgeProbeResult | null = null;
    let wrongUrlProbe: BridgeProbeResult | null = null;

    for (const url of urlsToTry) {
      const probe = await this.probeBridge(url);
      const { status } = probe;
      console.log(`[StreamEngineManager] Bridge probe result: ${status}`);

      if (status === "available") {
        this.bridgeUrl = url;
        this.bridgeAvailable = true;
        this.bridgeStatus = "available";
        this.bridgeDiagnostics = {
          ...probe,
          status,
          url,
          checkedAt: Date.now(),
        };
        this.activeStrategy = "local";

        if (this.retryTimer) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
        }
        return true;
      }

      if (status === "unsupported") {
        this.bridgeStatus = "unsupported";
        unsupportedProbe = { ...probe, url };
      }

      if (status === "wrong-url") {
        wrongUrlProbe = { ...probe, url };
      }
    }

    this.bridgeAvailable = false;
    const finalProbe = unsupportedProbe || wrongUrlProbe;
    this.bridgeStatus = finalProbe?.status || "unreachable";
    this.bridgeDiagnostics = finalProbe
      ? {
          ...finalProbe,
          status: this.bridgeStatus,
          url: finalProbe.url || defaultUrl,
          checkedAt: Date.now(),
        }
      : {
          status: this.bridgeStatus,
          url: defaultUrl,
          checkedAt: Date.now(),
        };
    console.warn(
      this.bridgeStatus === "unsupported"
        ? "[StreamEngineManager] Bridge is reachable but unsupported."
        : "[StreamEngineManager] Bridge unreachable after trying all fallbacks.",
    );

    // Schedule retries if not already scheduled
    if (!this.retryTimer) {
      this.retryTimer = setInterval(() => {
        this.detectBridge();
      }, 5000);
    }

    return false;
  }

  private async probeBridge(url: string): Promise<BridgeProbeResult> {
    try {
      new URL(url);
    } catch {
      return {
        status: "wrong-url",
        reason: "invalid-url",
        message: "Bridge URL is not a valid URL.",
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${url}/api/health`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const data = await res.json().catch(() => null);
        const torrentEngine = data?.torrentEngine;
        const runtime = data?.runtime;
        const selfTest = data?.selfTest;
        const repair = data?.repair;
        const auth = data?.auth;
        const capabilities = data?.capabilities;
        const remuxRuntime = data?.remuxRuntime;
        const remuxCache = data?.remuxCache;
        const torrentCache = data?.torrentCache;

        const reason = repair?.reason || torrentEngine?.reason || undefined;
        const message =
          repair?.detail ||
          torrentEngine?.message ||
          selfTest?.summary ||
          undefined;
        const processArch =
          torrentEngine?.processArch ||
          runtime?.processArch ||
          runtime?.nodeArch ||
          undefined;
        const runtimeArch = runtime?.nodeArch || undefined;
        const nativeArch = runtime?.nativeArch || undefined;
        const platform =
          torrentEngine?.platform || runtime?.platform || undefined;

        if (
          torrentEngine?.available === false ||
          repair?.required === true ||
          selfTest?.status === "fail"
        ) {
          return {
            status: "unsupported",
            reason,
            message,
            processArch,
            runtimeArch,
            nativeArch,
            platform,
            selfTest,
            repair,
            auth,
            capabilities,
            remuxRuntime,
            remuxCache,
            torrentCache,
          };
        }

        return {
          status: "available",
          processArch,
          runtimeArch,
          nativeArch,
          platform,
          selfTest,
          repair,
          auth,
          capabilities,
          remuxRuntime,
          remuxCache,
          torrentCache,
        };
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
    if (streamServerUrl) {
      const validation = validateBridgeUrl(streamServerUrl);
      if (validation.ok && validation.url) {
        this.bridgeUrl = validation.url;
        return this.bridgeUrl;
      }

      this.bridgeAvailable = false;
      this.bridgeStatus = "wrong-url";
      this.bridgeDiagnostics = {
        status: "wrong-url",
        url: streamServerUrl,
        reason: validation.reason,
        message: "Configured bridge URL is not a trusted local/LAN URL.",
        checkedAt: Date.now(),
      };
    }

    this.bridgeUrl = resolveBridgeUrl();
    return this.bridgeUrl;
  }

  getBridgeDiagnostics(): BridgeDiagnostics {
    return {
      ...this.bridgeDiagnostics,
      status: this.bridgeStatus,
      url: this.bridgeDiagnostics.url || this.getBridgeUrl(),
    };
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
