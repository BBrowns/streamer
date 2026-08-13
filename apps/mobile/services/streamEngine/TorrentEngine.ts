import {
  gatewayTrackCatalogSchema,
  type GatewayTrackCatalog,
  type NormalizedMediaTrack,
  type Stream,
} from "@streamer/shared";
import {
  isStreamEngineCancellationError,
  StreamEngineCancellationError,
  type AudioTrack,
  type GatewayJobProgress,
  type IStreamEngine,
  type SeekablePlaybackHandoff,
  type SubtitleTrack,
  type StreamStats,
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
  createdAt?: string;
  media?: {
    remuxed?: boolean;
    container?: string;
    seekable?: boolean;
    cacheStatus?: string;
    seekableCache?: {
      status?:
        "not_started" | "evaluating" | "preparing" | "ready" | "unavailable";
      unavailableReason?: SeekablePlaybackHandoff["unavailableReason"] | null;
      startedAt?: string | null;
      completedAt?: string | null;
    };
  };
}

const DEFAULT_GATEWAY_JOB_READY_TIMEOUT_MS = 45_000;
const GATEWAY_JOB_POLL_INTERVAL_MS = 1_000;
const MAX_SUBTITLE_DOCUMENT_CHARACTERS = 8 * 1024 * 1024;
const THUMBNAIL_BUCKET_SECONDS = 10;
const MAX_THUMBNAIL_BUCKET = 24 * 60 * 6;
const MAX_THUMBNAIL_BYTES = 512 * 1024;

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

function bytesToBase64(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const combined = (first << 16) | (second << 8) | third;
    encoded += alphabet[(combined >> 18) & 63];
    encoded += alphabet[(combined >> 12) & 63];
    encoded += index + 1 < bytes.length ? alphabet[(combined >> 6) & 63] : "=";
    encoded += index + 2 < bytes.length ? alphabet[combined & 63] : "=";
  }
  return encoded;
}

interface PlaybackOperation {
  generation: number;
  controller: AbortController;
}

interface ActiveGatewayJob {
  bridgeUrl: string;
  id: string;
  generation: number;
}

export class TorrentEngine implements IStreamEngine {
  private listeners = new Map<string, Set<Function>>();
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private activeGatewayJob: ActiveGatewayJob | null = null;
  private activeOperation: PlaybackOperation | null = null;
  private trackCatalogController: AbortController | null = null;
  private subtitleDocumentController: AbortController | null = null;
  private thumbnailController: AbortController | null = null;
  private audioTracks: AudioTrack[] = [];
  private subtitleTracks: SubtitleTrack[] = [];
  private operationGeneration = 0;
  private bridge: BridgeConfig;

  constructor(bridge: BridgeConfig) {
    this.bridge = bridge;
  }

  canPlay(stream: Stream): boolean {
    // Only claim we can play it if it's an infohash torrent
    return !!stream.infoHash;
  }

  async getPlaybackUri(stream: Stream): Promise<string> {
    const operation = this.beginPlaybackOperation();
    const previousGatewayCancellation = this.cancelActiveGatewayJob(false);
    try {
      // 1. Try to resolve via Backend (Real-Debrid Fallback)
      try {
        const { data } = await this.awaitOperation(
          operation,
          api.get(
            `/api/stream/resolve/${stream.type || "movie"}/${stream.id || stream.infoHash}/${stream.infoHash}`,
            { signal: operation.controller.signal },
          ),
        );
        if (
          data.resolved &&
          data.resolved.url &&
          data.resolved.type !== "magnet"
        ) {
          console.log("[TorrentEngine] Resolved via Debrid");
          return data.resolved.url;
        }
      } catch (error) {
        if (isStreamEngineCancellationError(error)) throw error;
        console.warn(
          "[TorrentEngine] Debrid resolution failed, falling back to local bridge",
        );
      }

      this.throwIfOperationCancelled(operation);

      // 2. Fallback to Local Bridge (stream-server)
      const bridgeUrl = this.bridge.getBridgeUrl?.() ?? this.bridge.bridgeUrl;
      // A no-peers result belongs to the previous torrent candidate, not to
      // the bridge itself. Keep real bridge failures blocked, but let a later
      // candidate create its own gateway job and discover its own peers.
      const canAttemptLocalGateway =
        this.bridge.bridgeStatus === "available" ||
        this.bridge.bridgeStatus === "no-peers";
      if (
        this.bridge.activeStrategy === "local" &&
        this.bridge.bridgeAvailable &&
        canAttemptLocalGateway
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
        await this.awaitOperation(operation, previousGatewayCancellation);
        this.emitForOperation(operation, "gateway", {
          state: "preparing",
          phase: "creating_gateway_job",
          progress: null,
          peerCount: null,
        } satisfies GatewayJobProgress);
        const job = await this.createGatewayJob(
          operation,
          bridgeUrl,
          magnet,
          stream,
        );

        if (!job?.playbackUrl) {
          throw new Error("Stream gateway did not return a playback URL");
        }
        if (job.id) {
          this.throwIfOperationCancelled(operation);
          this.activeGatewayJob = {
            bridgeUrl,
            id: job.id,
            generation: operation.generation,
          };
        }
        this.emitForOperation(operation, "gateway", job);

        const readyJob = await this.waitForGatewayJobReady(
          operation,
          bridgeUrl,
          job,
        );
        this.emitForOperation(operation, "gateway", readyJob);
        return toAbsoluteBridgeUrl(bridgeUrl, readyJob.playbackUrl!);
      }

      return "";
    } finally {
      this.finishPlaybackOperation(operation);
    }
  }

  /**
   * Queries the already-active gateway job for a completed seekable cache.
   * This deliberately never starts a second torrent or gateway job; the
   * bridge owns cache materialization after the first progressive consumer is
   * connected. The returned URL is runtime-only and is safe to use only for
   * the active player handoff.
   */
  async getSeekablePlaybackHandoff(
    options: {
      expectedGatewayJobId?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<SeekablePlaybackHandoff> {
    const activeJob = this.activeGatewayJob;
    if (
      !activeJob ||
      (options.expectedGatewayJobId &&
        activeJob.id !== options.expectedGatewayJobId)
    ) {
      return { status: "unavailable" };
    }

    const statusUrl = toAbsoluteBridgeUrl(
      activeJob.bridgeUrl,
      `/api/gateway/jobs/${encodeURIComponent(activeJob.id)}`,
    );
    const response = await fetch(statusUrl, {
      headers: getBridgeAuthHeaders(),
      signal: options.signal,
    });
    if (!response.ok) {
      return {
        gatewayJobId: activeJob.id,
        status: "unavailable",
      };
    }

    const job = (await response.json()) as GatewayJobResponse;
    if (
      !job.id ||
      job.id !== activeJob.id ||
      (options.expectedGatewayJobId && job.id !== options.expectedGatewayJobId)
    ) {
      return { status: "unavailable" };
    }

    const status = job.media?.seekableCache?.status ?? "unavailable";
    if (status === "ready" && job.media?.seekable && job.playbackUrl) {
      return {
        gatewayJobId: job.id,
        status,
        uri: toAbsoluteBridgeUrl(activeJob.bridgeUrl, job.playbackUrl),
      };
    }

    return {
      gatewayJobId: job.id,
      status,
      unavailableReason:
        job.media?.seekableCache?.unavailableReason ?? undefined,
    };
  }

  async getThumbnail(
    positionSeconds: number,
    signal?: AbortSignal,
  ): Promise<unknown | null> {
    const activeJob = this.activeGatewayJob;
    if (
      !activeJob ||
      !Number.isFinite(positionSeconds) ||
      positionSeconds < 0
    ) {
      return null;
    }
    const bucket = Math.round(positionSeconds / THUMBNAIL_BUCKET_SECONDS);
    if (!Number.isSafeInteger(bucket) || bucket > MAX_THUMBNAIL_BUCKET) {
      return null;
    }

    this.thumbnailController?.abort();
    const controller = new AbortController();
    this.thumbnailController = controller;
    const onExternalAbort = () =>
      controller.abort(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Thumbnail request cancelled"),
      );
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (signal?.aborted) onExternalAbort();

    try {
      const response = await fetch(
        toAbsoluteBridgeUrl(
          activeJob.bridgeUrl,
          `/api/gateway/jobs/${encodeURIComponent(
            activeJob.id,
          )}/thumbnails/${bucket}`,
        ),
        {
          headers: getBridgeAuthHeaders(),
          signal: controller.signal,
        },
      );
      if (!response.ok) return null;
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("image/jpeg")
      ) {
        return null;
      }

      const advertisedBytes = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(advertisedBytes) &&
        advertisedBytes > MAX_THUMBNAIL_BYTES
      ) {
        throw new Error("Thumbnail exceeded its size limit");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > MAX_THUMBNAIL_BYTES) {
        throw new Error("Thumbnail exceeded its size limit");
      }
      if (
        controller.signal.aborted ||
        this.activeGatewayJob?.id !== activeJob.id
      ) {
        throw (
          controller.signal.reason ?? new Error("Thumbnail request cancelled")
        );
      }

      return {
        uri: `data:image/jpeg;base64,${bytesToBase64(bytes)}`,
      };
    } finally {
      signal?.removeEventListener("abort", onExternalAbort);
      if (this.thumbnailController === controller) {
        this.thumbnailController = null;
      }
    }
  }

  private async createGatewayJob(
    operation: PlaybackOperation,
    bridgeUrl: string,
    magnet: string,
    stream: Stream,
  ): Promise<GatewayJobResponse> {
    let createdJob: GatewayJobResponse | null = null;
    let cleanupStarted = false;

    const cleanupLateJob = (job: GatewayJobResponse | null) => {
      if (!job?.id || cleanupStarted) return;
      cleanupStarted = true;
      void this.cancelGatewayJob(
        {
          bridgeUrl,
          id: job.id,
          generation: operation.generation,
        },
        false,
      );
    };

    const request = (async () => {
      const gatewayRes = await fetch(`${bridgeUrl}/api/gateway/jobs`, {
        method: "POST",
        headers: withBridgeJsonHeaders(),
        body: JSON.stringify({
          magnet,
          fileIdx: stream.fileIdx,
          fileSelectionHints: stream.fileSelectionHints,
          remux: stream.behaviorHints?.remuxToMp4 ? "mp4" : undefined,
          remuxStrategy:
            stream.behaviorHints?.remuxStrategy === "progressive-fmp4"
              ? "progressive-fmp4"
              : undefined,
        }),
        signal: operation.controller.signal,
      });
      createdJob = (await gatewayRes
        .json()
        .catch(() => null)) as GatewayJobResponse | null;

      if (!this.isOperationActive(operation)) {
        cleanupLateJob(createdJob);
        throw new StreamEngineCancellationError();
      }

      if (!gatewayRes.ok) {
        throw new Error(
          createdJob?.error ||
            `Stream gateway unavailable (${gatewayRes.status})`,
        );
      }

      if (!createdJob) {
        throw new Error("Stream gateway did not return a response");
      }
      return createdJob;
    })();

    try {
      return await this.awaitOperation(operation, request);
    } catch (error) {
      if (isStreamEngineCancellationError(error)) {
        // A bridge implementation can ignore AbortSignal and still create the
        // job. Clean that late job up without delaying logical cancellation.
        cleanupLateJob(createdJob);
      }
      throw error;
    }
  }

  private async waitForGatewayJobReady(
    operation: PlaybackOperation,
    bridgeUrl: string,
    initialJob: GatewayJobResponse,
  ): Promise<GatewayJobResponse> {
    this.throwIfOperationCancelled(operation);
    if (initialJob.state === "ready" || !initialJob.state) {
      this.bridge.bridgeStatus = "available";
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
    let deadline = this.gatewayJobDeadline(initialJob, timeoutMs);
    let advertisedReadyTimeoutMs = initialJob.readyTimeoutMs;

    while (Date.now() < deadline) {
      this.throwIfOperationCancelled(operation);
      try {
        const statusRes = await this.awaitOperation(
          operation,
          fetch(statusUrl, {
            headers: getBridgeAuthHeaders(),
            signal: operation.controller.signal,
          }),
        );

        if (!statusRes.ok) {
          throw new Error(
            `Stream gateway status unavailable (${statusRes.status})`,
          );
        }

        const job = await this.awaitOperation(
          operation,
          statusRes.json() as Promise<GatewayJobResponse>,
        );
        // The bridge can discover the real selected container only after
        // torrent metadata arrives. If that turns an initially generic job
        // into a remux job, honour its one-time larger readiness window rather
        // than cancelling it using the shorter pre-metadata budget.
        if (
          typeof job.readyTimeoutMs === "number" &&
          job.readyTimeoutMs > (advertisedReadyTimeoutMs ?? 0)
        ) {
          advertisedReadyTimeoutMs = job.readyTimeoutMs;
          deadline = Math.max(
            deadline,
            this.gatewayJobDeadline(
              job,
              job.readyTimeoutMs + GATEWAY_JOB_POLL_INTERVAL_MS,
            ),
          );
        }
        this.emitForOperation(operation, "gateway", job);
        if (job.state === "ready" && job.playbackUrl) {
          this.bridge.bridgeStatus = "available";
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
          const err = new Error(
            job.error || "Stream gateway job was cancelled",
          );
          (err as any).isTerminal = true;
          throw err;
        }
      } catch (err: any) {
        if (isStreamEngineCancellationError(err)) throw err;
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

      await this.waitForNextPoll(operation, GATEWAY_JOB_POLL_INTERVAL_MS);
    }

    this.throwIfOperationCancelled(operation);
    this.bridge.bridgeStatus = "no-peers";
    await this.awaitOperation(operation, this.cancelActiveGatewayJob(false));
    throw new Error(
      "Still waiting for torrent peers. Try again shortly or choose another source.",
    );
  }

  private gatewayJobDeadline(job: GatewayJobResponse, timeoutMs: number) {
    // Gateway `createdAt` belongs to the desktop/mobile bridge clock, which
    // need not be synchronized with this client. Its own elapsed duration is
    // safe to use as a relative budget, while comparing server wall-clock time
    // with `Date.now()` can make a healthy LAN job expire immediately.
    const elapsedMs =
      typeof job.elapsedMs === "number" && Number.isFinite(job.elapsedMs)
        ? Math.max(0, job.elapsedMs)
        : 0;
    const remainingMs = Math.max(
      GATEWAY_JOB_POLL_INTERVAL_MS,
      timeoutMs - elapsedMs,
    );
    return Date.now() + remainingMs;
  }

  private beginPlaybackOperation(): PlaybackOperation {
    const previousOperation = this.activeOperation;
    if (previousOperation) previousOperation.controller.abort();
    this.trackCatalogController?.abort();
    this.trackCatalogController = null;
    this.subtitleDocumentController?.abort();
    this.subtitleDocumentController = null;
    this.audioTracks = [];
    this.subtitleTracks = [];

    const operation: PlaybackOperation = {
      generation: ++this.operationGeneration,
      controller: new AbortController(),
    };
    this.activeOperation = operation;
    return operation;
  }

  private finishPlaybackOperation(operation: PlaybackOperation) {
    if (this.activeOperation === operation) {
      this.activeOperation = null;
    }
  }

  private cancelPlaybackOperation() {
    const operation = this.activeOperation;
    this.activeOperation = null;
    this.operationGeneration += 1;
    operation?.controller.abort();
  }

  private isOperationActive(operation: PlaybackOperation) {
    return (
      this.activeOperation === operation &&
      operation.generation === this.operationGeneration &&
      !operation.controller.signal.aborted
    );
  }

  private throwIfOperationCancelled(operation: PlaybackOperation) {
    if (!this.isOperationActive(operation)) {
      throw new StreamEngineCancellationError();
    }
  }

  private awaitOperation<T>(
    operation: PlaybackOperation,
    promise: Promise<T>,
  ): Promise<T> {
    if (!this.isOperationActive(operation)) {
      void promise.catch(() => undefined);
      return Promise.reject(new StreamEngineCancellationError());
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        operation.controller.signal.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () =>
        finish(() => reject(new StreamEngineCancellationError()));

      operation.controller.signal.addEventListener("abort", onAbort, {
        once: true,
      });
      if (operation.controller.signal.aborted) {
        void promise.catch(() => undefined);
        onAbort();
        return;
      }
      promise.then(
        (value) =>
          finish(() => {
            if (this.isOperationActive(operation)) resolve(value);
            else reject(new StreamEngineCancellationError());
          }),
        (error) =>
          finish(() => {
            if (
              !this.isOperationActive(operation) ||
              operation.controller.signal.aborted ||
              isStreamEngineCancellationError(error) ||
              (error as { name?: unknown })?.name === "AbortError"
            ) {
              reject(new StreamEngineCancellationError());
            } else {
              reject(error);
            }
          }),
      );
    });
  }

  private waitForNextPoll(operation: PlaybackOperation, ms: number) {
    this.throwIfOperationCancelled(operation);
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new StreamEngineCancellationError());
      };
      const timer = setTimeout(() => {
        operation.controller.signal.removeEventListener("abort", onAbort);
        if (this.isOperationActive(operation)) resolve();
        else reject(new StreamEngineCancellationError());
      }, ms);
      operation.controller.signal.addEventListener("abort", onAbort, {
        once: true,
      });
      if (operation.controller.signal.aborted) onAbort();
    });
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

  private async cancelGatewayJob(
    activeJob: ActiveGatewayJob,
    emitCancellation: boolean,
  ) {
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
      if (emitCancellation) {
        this.emit("gateway", {
          id: activeJob.id,
          state: "cancelled",
          phase: "cancelled",
          progress: null,
        } satisfies GatewayJobProgress);
      }
    } catch (error: any) {
      console.warn(
        "[TorrentEngine] Failed to cancel gateway job:",
        error?.message || error,
      );
    }
  }

  private async cancelActiveGatewayJob(emitCancellation = true) {
    const activeJob = this.activeGatewayJob;
    if (!activeJob) return;

    this.thumbnailController?.abort();
    this.thumbnailController = null;
    this.activeGatewayJob = null;
    await this.cancelGatewayJob(activeJob, emitCancellation);
  }

  private emitForOperation(
    operation: PlaybackOperation,
    event: string,
    data: unknown,
  ) {
    if (this.isOperationActive(operation)) this.emit(event, data);
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

  getAudioTracks(): AudioTrack[] {
    return this.audioTracks.map((track) => ({ ...track }));
  }

  getSubtitles(): SubtitleTrack[] {
    return this.subtitleTracks.map((track) => ({ ...track }));
  }

  setSubtitle(id: string | null): void {
    if (id && !this.subtitleTracks.some((track) => track.id === id)) return;
    this.subtitleTracks = this.subtitleTracks.map((track) => ({
      ...track,
      active: id !== null && track.id === id,
    }));
    this.emitTracks();
  }

  async refreshTrackCatalog(signal?: AbortSignal): Promise<void> {
    const activeJob = this.activeGatewayJob;
    if (!activeJob) {
      this.audioTracks = [];
      this.subtitleTracks = [];
      this.emitTracks();
      return;
    }

    this.trackCatalogController?.abort();
    const controller = new AbortController();
    this.trackCatalogController = controller;
    const onExternalAbort = () =>
      controller.abort(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Track discovery cancelled"),
      );
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (signal?.aborted) onExternalAbort();

    try {
      const response = await fetch(
        toAbsoluteBridgeUrl(
          activeJob.bridgeUrl,
          `/api/gateway/jobs/${encodeURIComponent(activeJob.id)}/tracks`,
        ),
        {
          headers: getBridgeAuthHeaders(),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`Track catalog unavailable (${response.status})`);
      }

      const parsed = gatewayTrackCatalogSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.jobId !== activeJob.id) {
        throw new Error("Track catalog response was invalid");
      }
      if (
        controller.signal.aborted ||
        this.activeGatewayJob?.id !== activeJob.id
      ) {
        return;
      }

      this.applyTrackCatalog(parsed.data);
    } finally {
      signal?.removeEventListener("abort", onExternalAbort);
      if (this.trackCatalogController === controller) {
        this.trackCatalogController = null;
      }
    }
  }

  private applyTrackCatalog(catalog: GatewayTrackCatalog) {
    const selectedAudioId = this.audioTracks.find((track) => track.active)?.id;
    const supportedAudio = catalog.tracks.filter(
      (track) => track.kind === "audio" && track.supported,
    );
    const defaultAudioId =
      supportedAudio.find((track) => track.id === selectedAudioId)?.id ??
      supportedAudio.find((track) => track.default)?.id ??
      supportedAudio[0]?.id;

    this.audioTracks = supportedAudio.map((track) => ({
      id: track.id,
      label: this.audioTrackLabel(track),
      language: track.language,
      active: track.id === defaultAudioId,
      codec: track.codec,
      channelCount: track.channelCount,
      channelLayout: track.channelLayout,
      audioDescription: track.audioDescription,
      commentary: track.commentary,
      source: track.source,
    }));

    const selectedSubtitleId = this.subtitleTracks.find(
      (track) => track.active,
    )?.id;
    this.subtitleTracks = catalog.subtitles
      .filter((subtitle) => Boolean(subtitle.fetchIdentity))
      .map((subtitle) => ({
        id: subtitle.id,
        label: subtitle.label,
        language: subtitle.language,
        active: subtitle.id === selectedSubtitleId,
        format: subtitle.format,
        source: subtitle.source,
        forced: subtitle.forced,
        hearingImpaired: subtitle.hearingImpaired,
        fetchIdentity: subtitle.fetchIdentity,
        providerName: subtitle.providerName,
        confidence: subtitle.confidence,
        contentIdMatch: subtitle.contentIdMatch,
      }));
    this.emitTracks();
  }

  private audioTrackLabel(track: NormalizedMediaTrack) {
    if (track.title) return track.title;
    const channelLabel =
      track.channelLayout ||
      (track.channelCount ? `${track.channelCount}ch` : undefined);
    return [
      track.language.toUpperCase(),
      channelLabel,
      track.codec.toUpperCase(),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  async loadSubtitleDocument(
    id: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const activeJob = this.activeGatewayJob;
    const track = this.subtitleTracks.find(
      (candidate) => candidate.id === id || candidate.fetchIdentity === id,
    );
    if (!activeJob || !track?.fetchIdentity) {
      throw new Error("Subtitle is unavailable for the active source");
    }

    this.subtitleDocumentController?.abort();
    const controller = new AbortController();
    this.subtitleDocumentController = controller;
    const onExternalAbort = () =>
      controller.abort(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Subtitle request cancelled"),
      );
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (signal?.aborted) onExternalAbort();

    try {
      const response = await fetch(
        toAbsoluteBridgeUrl(
          activeJob.bridgeUrl,
          `/api/gateway/jobs/${encodeURIComponent(
            activeJob.id,
          )}/subtitles/${encodeURIComponent(track.fetchIdentity)}`,
        ),
        {
          headers: getBridgeAuthHeaders(),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`Subtitle unavailable (${response.status})`);
      }
      const advertisedBytes = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(advertisedBytes) &&
        advertisedBytes > MAX_SUBTITLE_DOCUMENT_CHARACTERS
      ) {
        throw new Error("Subtitle document exceeded its size limit");
      }

      const document = await response.text();
      if (document.length > MAX_SUBTITLE_DOCUMENT_CHARACTERS) {
        throw new Error("Subtitle document exceeded its size limit");
      }
      if (!/^WEBVTT(?:\r?\n|$)/.test(document)) {
        throw new Error("Subtitle response was not WebVTT");
      }
      if (
        controller.signal.aborted ||
        this.activeGatewayJob?.id !== activeJob.id
      ) {
        throw (
          controller.signal.reason ?? new Error("Subtitle request cancelled")
        );
      }
      return document;
    } finally {
      signal?.removeEventListener("abort", onExternalAbort);
      if (this.subtitleDocumentController === controller) {
        this.subtitleDocumentController = null;
      }
    }
  }

  private emitTracks() {
    this.emit("tracks", {
      audioTracks: this.getAudioTracks(),
      subtitles: this.getSubtitles(),
    });
  }

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
    this.cancelPlaybackOperation();
    this.trackCatalogController?.abort();
    this.trackCatalogController = null;
    this.subtitleDocumentController?.abort();
    this.subtitleDocumentController = null;
    this.thumbnailController?.abort();
    this.thumbnailController = null;
    this.audioTracks = [];
    this.subtitleTracks = [];
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    void this.cancelActiveGatewayJob(false);
    this.listeners.clear();
  }
}
