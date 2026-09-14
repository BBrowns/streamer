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

function bridgeAbortError() {
  const error = new Error("Bridge detection cancelled");
  error.name = "AbortError";
  return error;
}

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
  private detectBridgeInFlight: Promise<boolean> | null = null;
  public bridgeRefreshing = false;
  private bridgeGeneration = 0;
  private detectionController: AbortController | null = null;
  private unsubscribeAuth: () => void;
  private bridgeListeners = new Set<() => void>();

  constructor() {
    this.registerEngine(new HLSEngine());
    this.registerEngine(new HttpVideoEngine());
    this.registerEngine(new TorrentEngine(this));
    this.unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
      if (
        state.streamServerUrl !== previous.streamServerUrl ||
        state.streamServerToken !== previous.streamServerToken ||
        state.backendUrl !== previous.backendUrl ||
        state.user?.id !== previous.user?.id ||
        state.isAuthenticated !== previous.isAuthenticated ||
        state.isHydrated !== previous.isHydrated ||
        state.credentialsHydrated !== previous.credentialsHydrated
      ) {
        this.invalidateBridge();
      }
    });
  }

  detectBridge(): Promise<boolean> {
    if (this.detectBridgeInFlight) return this.detectBridgeInFlight;

    const generation = this.bridgeGeneration;
    const controller = new AbortController();
    this.detectionController = controller;
    this.bridgeRefreshing = true;
    // Register the shared operation before notifying subscribers.
    const detection = Promise.resolve()
      .then(() => this.detectBridgeInternal(generation, controller.signal))
      .finally(() => {
        if (this.detectBridgeInFlight === detection) {
          this.detectBridgeInFlight = null;
          this.detectionController = null;
          this.bridgeRefreshing = false;
          this.notifyBridgeListeners();
        }
      });
    this.detectBridgeInFlight = detection;
    this.notifyBridgeListeners();
    return detection;
  }

  invalidateBridge() {
    this.bridgeGeneration += 1;
    this.detectionController?.abort();
    this.detectionController = null;
    this.detectBridgeInFlight = null;
    this.bridgeRefreshing = false;
    this.bridgeAvailable = false;
    this.bridgeStatus = "loading";
    this.activeStrategy = "debrid";
    this.bridgeUrl = resolveBridgeUrl();
    this.bridgeDiagnostics = { status: "loading", url: this.getBridgeUrl() };
    this.notifyBridgeListeners();
  }

  subscribeBridge(listener: () => void): () => void {
    this.bridgeListeners.add(listener);
    return () => this.bridgeListeners.delete(listener);
  }

  getBridgeSnapshot() {
    return {
      available: this.bridgeAvailable,
      status: this.bridgeStatus,
      diagnostics: this.getBridgeDiagnostics(),
      url: this.bridgeUrl,
      refreshing: this.bridgeRefreshing,
      generation: this.bridgeGeneration,
    };
  }

  private notifyBridgeListeners() {
    for (const listener of this.bridgeListeners) listener();
  }

  private commitBridgeProbe(probe: BridgeProbeResult) {
    const changed =
      this.bridgeStatus !== probe.status ||
      this.bridgeDiagnostics.reason !== probe.reason;
    this.bridgeAvailable = probe.status === "available";
    this.bridgeStatus = probe.status;
    this.bridgeDiagnostics = { ...probe, checkedAt: Date.now() };
    if (this.bridgeAvailable) {
      this.bridgeUrl = probe.url!;
      this.activeStrategy = "local";
    }
    if (changed) {
      console.log(`[StreamEngineManager] Bridge readiness: ${probe.status}`);
    }
    return this.bridgeAvailable;
  }

  private async detectBridgeInternal(
    generation: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    const assertCurrent = () => {
      if (signal.aborted || generation !== this.bridgeGeneration) {
        throw bridgeAbortError();
      }
    };
    assertCurrent();
    const urlsToTry = new Set<string>();
    const defaultUrl = this.getBridgeUrl();
    if (!defaultUrl) {
      return this.commitBridgeProbe({
        status: "wrong-url",
        reason: "invalid-url",
        message: "Bridge URL is not trusted.",
        checkedAt: Date.now(),
      });
    }
    urlsToTry.add(defaultUrl);

    // Fallbacks for simulators/local usage
    if (Platform.OS === "web" || Platform.OS === "ios") {
      urlsToTry.add("http://localhost:11470");
      urlsToTry.add("http://127.0.0.1:11470");
    } else if (Platform.OS === "android") {
      urlsToTry.add("http://10.0.2.2:11470");
    }

    let unsupportedProbe: BridgeProbeResult | null = null;
    let wrongUrlProbe: BridgeProbeResult | null = null;

    for (const url of urlsToTry) {
      const probe = await this.probeBridge(url, signal);
      assertCurrent();
      const { status } = probe;

      if (status === "available") {
        return this.commitBridgeProbe({ ...probe, url });
      }

      if (status === "unsupported") {
        unsupportedProbe = { ...probe, url };
      }

      if (status === "wrong-url") {
        wrongUrlProbe = { ...probe, url };
      }
    }

    const finalProbe = unsupportedProbe || wrongUrlProbe;
    return this.commitBridgeProbe(
      finalProbe ?? { status: "unreachable", url: defaultUrl },
    );
  }

  private async requestBridgeStatus(
    url: string,
    signal: AbortSignal,
    health: boolean,
  ) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(onAbort, 1500);
    let rejectAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(bridgeAbortError());
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    if (signal.aborted) onAbort();
    try {
      return await Promise.race([
        aborted,
        (async () => {
          if (controller.signal.aborted) throw bridgeAbortError();
          const response = await fetch(url, { signal: controller.signal });
          const data = health && response.ok ? await response.json() : null;
          return { ok: response.ok, status: response.status, data };
        })(),
      ]);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      controller.signal.removeEventListener("abort", rejectAbort);
    }
  }

  private async probeBridge(
    url: string,
    signal: AbortSignal,
  ): Promise<BridgeProbeResult> {
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
      const res = await this.requestBridgeStatus(
        `${url}/api/health`,
        signal,
        true,
      );
      if (res.status === 404 || res.status === 405) {
        const legacy = await this.requestBridgeStatus(
          `${url}/status`,
          signal,
          false,
        );
        return { status: legacy.ok ? "available" : "unreachable" };
      }

      if (res.ok) {
        const data = res.data;
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
      if (signal.aborted) throw bridgeAbortError();
      // A timed-out/invalid health response must not be masked by /status.
      // Legacy probing is reserved for an explicitly missing health endpoint.
      return { status: "unreachable" };
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

      return resolveBridgeUrl();
    }

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
    this.unsubscribeAuth();
    this.invalidateBridge();
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
