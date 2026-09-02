import type {
  BridgeCapabilitiesV1,
  BridgeDelivery,
  BridgeJobMetricsV1,
  BridgeJobResponseV1,
  BridgeTrackCatalogV1,
  NormalizedMediaTrack,
  Stream,
} from "@streamer/shared";
import type {
  AudioTrack,
  IStreamEngine,
  SeekablePlaybackHandoff,
  StreamEngineEventMap,
  SubtitleTrack,
} from "../streamEngine/IStreamEngine";
import {
  BRIDGE_V1_CLIENT_MAX_SUBTITLE_BYTES,
  BRIDGE_V1_CLIENT_MAX_THUMBNAIL_BYTES,
  BridgeClientError,
  type BridgeBinaryRequestOptions,
} from "./BridgeClient";
import {
  bindBridgeV1StreamUri,
  isBridgeV1OpaqueId,
} from "./BridgeV1StreamGuard";

const DEFAULT_METRICS_POLL_INTERVAL_MS = 2_000;
const MAX_METRICS_RETRY_INTERVAL_MS = 5_000;
const MAX_CLIENT_THUMBNAIL_BUCKET = 24 * 60 * 6;
const MAX_CLIENT_THUMBNAIL_BUCKET_SECONDS = 60 * 60;

export interface BridgeV1PlaybackRuntimeClient {
  getCapabilities(signal?: AbortSignal): Promise<BridgeCapabilitiesV1>;
  getJob(jobId: string, signal?: AbortSignal): Promise<BridgeJobResponseV1>;
  getJobMetrics(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<BridgeJobMetricsV1>;
  getTrackCatalog(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<BridgeTrackCatalogV1>;
  getSubtitleDocument(
    jobId: string,
    documentId: string,
    options: BridgeBinaryRequestOptions,
  ): Promise<string>;
  getThumbnail(
    jobId: string,
    bucket: number,
    options: BridgeBinaryRequestOptions,
  ): Promise<Uint8Array>;
}

export interface BridgeV1PlaybackRuntimeOptions {
  client: BridgeV1PlaybackRuntimeClient;
  baseOrigin: string;
  jobId: string;
  delivery: BridgeDelivery;
  /** Already-validated signed URI owned by the active PreparedSourceLease. */
  initialUri: string;
  now?: () => number;
  metricsPollIntervalMs?: number;
}

interface RuntimeLimits {
  maxSubtitleBytes: number;
  thumbnailBucketSeconds: number;
  maxThumbnailBucket: number;
  maxThumbnailBytes: number;
}

type RuntimeListener = (
  data: StreamEngineEventMap[keyof StreamEngineEventMap],
) => void;

function abortError(reason: unknown, message: string) {
  if (reason instanceof Error) return reason;
  return Object.assign(new Error(message), { name: "AbortError" });
}

function throwIfAborted(signal: AbortSignal, message: string): void {
  if (signal.aborted) throw abortError(signal.reason, message);
}

function linkAbort(
  externalSignal: AbortSignal | undefined,
  controller: AbortController,
  message: string,
) {
  const onAbort = () =>
    controller.abort(abortError(externalSignal?.reason, message));
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  if (externalSignal?.aborted) onAbort();
  return () => externalSignal?.removeEventListener("abort", onAbort);
}

function awaitWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  message: string,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal.reason, message));

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(abortError(signal.reason, message));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
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

function invalidCatalog() {
  return new Error("Track catalog response was invalid");
}

export class BridgeV1PlaybackRuntime implements IStreamEngine {
  private readonly client: BridgeV1PlaybackRuntimeClient;
  private readonly baseOrigin: string;
  private readonly jobId: string;
  private readonly delivery: BridgeDelivery;
  private readonly now: () => number;
  private readonly metricsPollIntervalMs: number;
  private readonly lifecycleController = new AbortController();
  private readonly listeners = new Map<
    keyof StreamEngineEventMap,
    Set<RuntimeListener>
  >();
  private initialUri: string | null;
  private stopped = false;
  private metricsTimer: ReturnType<typeof setTimeout> | null = null;
  private metricsController: AbortController | null = null;
  private lastMetricsSampleAt = Number.NEGATIVE_INFINITY;
  private trackCatalogController: AbortController | null = null;
  private subtitleDocumentController: AbortController | null = null;
  private thumbnailController: AbortController | null = null;
  private handoffController: AbortController | null = null;
  private capabilities: BridgeCapabilitiesV1 | null = null;
  private capabilitiesPromise: Promise<BridgeCapabilitiesV1> | null = null;
  private boundMediaId: string | null = null;
  private audioTracks: AudioTrack[] = [];
  private subtitleTracks: SubtitleTrack[] = [];
  private subtitleDocumentIds = new Map<string, string>();
  private selectedAudioTrackId: string | null = null;
  private selectedAudioUri: string | null = null;

  constructor(options: BridgeV1PlaybackRuntimeOptions) {
    if (!isBridgeV1OpaqueId(options.jobId)) {
      throw new Error("The bridge runtime identity is invalid.");
    }
    const configuredOrigin = new URL(options.baseOrigin);
    const initialUri = new URL(options.initialUri);
    const expectedPath = `/api/bridge/v1/jobs/${encodeURIComponent(options.jobId)}/stream`;
    if (
      configuredOrigin.origin !== options.baseOrigin ||
      configuredOrigin.username ||
      configuredOrigin.password ||
      initialUri.origin !== configuredOrigin.origin ||
      initialUri.pathname !== expectedPath ||
      initialUri.hash
    ) {
      throw new Error("The bridge runtime source is invalid.");
    }
    if (
      options.metricsPollIntervalMs !== undefined &&
      (!Number.isFinite(options.metricsPollIntervalMs) ||
        options.metricsPollIntervalMs < 0)
    ) {
      throw new Error("The bridge metrics interval is invalid.");
    }

    this.client = options.client;
    this.baseOrigin = configuredOrigin.origin;
    this.jobId = options.jobId;
    this.delivery = options.delivery;
    this.initialUri = initialUri.toString();
    this.now = options.now ?? Date.now;
    this.metricsPollIntervalMs =
      options.metricsPollIntervalMs ?? DEFAULT_METRICS_POLL_INTERVAL_MS;
  }

  canPlay(stream: Stream): boolean {
    return (
      !this.stopped &&
      this.initialUri !== null &&
      stream.url === this.initialUri
    );
  }

  async getPlaybackUri(stream: Stream): Promise<string> {
    if (!this.canPlay(stream) || !this.initialUri) {
      throw new Error("The prepared bridge source is no longer available.");
    }
    return this.initialUri;
  }

  getEngineType(): string {
    return "bridge-v1";
  }

  getAudioTracks(): AudioTrack[] {
    return this.audioTracks.map((track) => ({ ...track }));
  }

  async selectAudioTrack(id: string): Promise<string | null> {
    if (
      this.stopped ||
      (this.delivery !== "progressive-fmp4" && this.delivery !== "hls")
    ) {
      return null;
    }
    const selectedTrack = this.audioTracks.find((track) => track.id === id);
    if (!selectedTrack || selectedTrack.active) return null;

    const streamIndex = /^audio:(\d+)$/.exec(selectedTrack.id)?.[1];
    if (!streamIndex || !this.initialUri) return null;

    const nextUri = new URL(this.selectedAudioUri ?? this.initialUri);
    nextUri.searchParams.set("audioTrack", streamIndex);
    // The player must commit the new language only after the replacement
    // source reaches a usable state. A failed variant therefore leaves the
    // currently playing language intact.
    return nextUri.toString();
  }

  commitAudioTrackSelection(id: string, uri: string): void {
    if (this.stopped || !this.initialUri) return;
    const selectedTrack = this.audioTracks.find((track) => track.id === id);
    if (!selectedTrack || !/^audio:\d+$/.test(id)) return;

    try {
      const candidateUri = new URL(uri);
      const currentUri = new URL(this.selectedAudioUri ?? this.initialUri);
      if (
        candidateUri.origin !== currentUri.origin ||
        candidateUri.pathname !== currentUri.pathname ||
        candidateUri.searchParams.get("audioTrack") !==
          id.slice("audio:".length)
      ) {
        return;
      }
    } catch {
      return;
    }

    this.selectedAudioUri = uri;
    this.selectedAudioTrackId = selectedTrack.id;
    this.audioTracks = this.audioTracks.map((track) => ({
      ...track,
      active: track.id === selectedTrack.id,
    }));
    this.emitTracks();
  }

  getActivePlaybackUri(): string | null {
    return this.initialUri ? (this.selectedAudioUri ?? this.initialUri) : null;
  }

  getSubtitles(): SubtitleTrack[] {
    return this.subtitleTracks.map((track) => ({ ...track }));
  }

  setSubtitle(id: string | null): void {
    if (id && !this.subtitleDocumentIds.has(id)) return;
    this.subtitleTracks = this.subtitleTracks.map((track) => ({
      ...track,
      active: id !== null && track.id === id,
    }));
    this.emitTracks();
  }

  async refreshTrackCatalog(signal?: AbortSignal): Promise<void> {
    this.assertActive();
    this.trackCatalogController?.abort(
      abortError(undefined, "Track discovery cancelled."),
    );
    const controller = new AbortController();
    this.trackCatalogController = controller;
    const unlink = linkAbort(signal, controller, "Track discovery cancelled.");

    try {
      throwIfAborted(controller.signal, "Track discovery cancelled.");
      const catalog = await this.client.getTrackCatalog(
        this.jobId,
        controller.signal,
      );
      if (
        this.stopped ||
        controller.signal.aborted ||
        this.trackCatalogController !== controller
      ) {
        return;
      }
      this.applyTrackCatalog(catalog);
    } finally {
      unlink();
      if (this.trackCatalogController === controller) {
        this.trackCatalogController = null;
      }
    }
  }

  async loadSubtitleDocument(
    id: string,
    signal?: AbortSignal,
  ): Promise<string> {
    this.assertActive();
    const documentId = this.subtitleDocumentIds.get(id);
    if (!documentId) {
      throw new Error("Subtitle is unavailable for the active source");
    }

    this.subtitleDocumentController?.abort(
      abortError(undefined, "Subtitle request cancelled."),
    );
    const controller = new AbortController();
    this.subtitleDocumentController = controller;
    const unlink = linkAbort(signal, controller, "Subtitle request cancelled.");
    try {
      throwIfAborted(controller.signal, "Subtitle request cancelled.");
      const limits = await this.getRuntimeLimits(controller.signal);
      throwIfAborted(controller.signal, "Subtitle request cancelled.");
      const document = await this.client.getSubtitleDocument(
        this.jobId,
        documentId,
        { signal: controller.signal, maxBytes: limits.maxSubtitleBytes },
      );
      throwIfAborted(controller.signal, "Subtitle request cancelled.");
      if (
        this.stopped ||
        this.subtitleDocumentController !== controller ||
        this.subtitleDocumentIds.get(id) !== documentId
      ) {
        throw abortError(undefined, "Subtitle request cancelled.");
      }
      return document;
    } finally {
      unlink();
      if (this.subtitleDocumentController === controller) {
        this.subtitleDocumentController = null;
      }
    }
  }

  async getSeekablePlaybackHandoff(
    options: {
      expectedGatewayJobId?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<SeekablePlaybackHandoff> {
    if (
      this.stopped ||
      (options.expectedGatewayJobId &&
        options.expectedGatewayJobId !== this.jobId)
    ) {
      return { status: "unavailable" };
    }

    // The seekable cache is materialized for the original/default audio
    // choice. Do not silently replace a user-selected live audio variant with
    // that cache and switch the language back underneath the viewer.
    if (this.selectedAudioTrackId) return { status: "unavailable" };

    this.handoffController?.abort(
      abortError(undefined, "Seekable handoff request cancelled."),
    );
    const controller = new AbortController();
    this.handoffController = controller;
    const unlink = linkAbort(
      options.signal,
      controller,
      "Seekable handoff request cancelled.",
    );
    try {
      const response = await this.client.getJob(this.jobId, controller.signal);
      throwIfAborted(controller.signal, "Seekable handoff request cancelled.");
      const job = response.job;
      if (
        this.stopped ||
        this.handoffController !== controller ||
        job.id !== this.jobId ||
        job.delivery !== this.delivery
      ) {
        return { status: "unavailable" };
      }

      if (job.state === "cancelled") {
        return {
          gatewayJobId: this.jobId,
          status: "unavailable",
          unavailableReason: "cancelled",
        };
      }
      if (
        job.state === "expired" ||
        job.state === "error" ||
        job.state === "no_peers" ||
        job.state === "stalled"
      ) {
        return { gatewayJobId: this.jobId, status: "unavailable" };
      }

      const cache = job.media.seekableCache;
      if (!cache) {
        return { gatewayJobId: this.jobId, status: "unavailable" };
      }
      if (cache.status === "unavailable") {
        return {
          gatewayJobId: this.jobId,
          status: cache.status,
          unavailableReason: cache.unavailableReason,
        };
      }
      if (cache.status !== "ready") {
        return { gatewayJobId: this.jobId, status: cache.status };
      }
      if (job.state !== "ready" || job.media.seek !== "immediate") {
        return { gatewayJobId: this.jobId, status: "unavailable" };
      }

      try {
        return {
          gatewayJobId: this.jobId,
          status: "ready",
          uri: bindBridgeV1StreamUri({
            baseOrigin: this.baseOrigin,
            job,
            now: this.now(),
          }),
        };
      } catch {
        return { gatewayJobId: this.jobId, status: "unavailable" };
      }
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (
        error instanceof BridgeClientError &&
        ["JOB_NOT_FOUND", "JOB_CANCELLED", "JOB_EXPIRED"].includes(error.code)
      ) {
        return { gatewayJobId: this.jobId, status: "unavailable" };
      }
      throw error;
    } finally {
      unlink();
      if (this.handoffController === controller) {
        this.handoffController = null;
      }
    }
  }

  async getThumbnail(
    positionSeconds: number,
    signal?: AbortSignal,
  ): Promise<unknown | null> {
    if (
      this.stopped ||
      !Number.isFinite(positionSeconds) ||
      positionSeconds < 0
    ) {
      return null;
    }

    this.thumbnailController?.abort(
      abortError(undefined, "Thumbnail request cancelled."),
    );
    const controller = new AbortController();
    this.thumbnailController = controller;
    const unlink = linkAbort(
      signal,
      controller,
      "Thumbnail request cancelled.",
    );
    try {
      const limits = await this.getRuntimeLimits(controller.signal);
      throwIfAborted(controller.signal, "Thumbnail request cancelled.");
      const bucket = Math.round(
        positionSeconds / limits.thumbnailBucketSeconds,
      );
      if (
        !Number.isSafeInteger(bucket) ||
        bucket < 0 ||
        bucket > limits.maxThumbnailBucket
      ) {
        return null;
      }
      const bytes = await this.client.getThumbnail(this.jobId, bucket, {
        signal: controller.signal,
        maxBytes: limits.maxThumbnailBytes,
      });
      throwIfAborted(controller.signal, "Thumbnail request cancelled.");
      if (this.stopped || this.thumbnailController !== controller) {
        throw abortError(undefined, "Thumbnail request cancelled.");
      }
      return {
        uri: `data:image/jpeg;base64,${bytesToBase64(bytes)}`,
      };
    } catch (error) {
      if (controller.signal.aborted) throw error;
      return null;
    } finally {
      unlink();
      if (this.thumbnailController === controller) {
        this.thumbnailController = null;
      }
    }
  }

  on<K extends keyof StreamEngineEventMap>(
    event: K,
    callback: (data: StreamEngineEventMap[K]) => void,
  ): void {
    if (this.stopped) return;
    const callbacks = this.listeners.get(event) ?? new Set<RuntimeListener>();
    callbacks.add(callback as RuntimeListener);
    this.listeners.set(event, callbacks);
    if (event === "stats" && callbacks.size === 1) {
      this.scheduleMetricsPoll(0);
    }
  }

  off<K extends keyof StreamEngineEventMap>(
    event: K,
    callback: (data: StreamEngineEventMap[K]) => void,
  ): void {
    const callbacks = this.listeners.get(event);
    callbacks?.delete(callback as RuntimeListener);
    if (callbacks?.size === 0) this.listeners.delete(event);
    if (event === "stats" && !this.listeners.has("stats")) {
      this.stopMetricsPolling();
    }
  }

  /** Stop observation only. PreparedSourceLease owns the bridge DELETE. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.initialUri = null;
    this.lifecycleController.abort(
      abortError(undefined, "Bridge runtime stopped."),
    );
    this.stopMetricsPolling();
    this.trackCatalogController?.abort(
      abortError(undefined, "Track discovery cancelled."),
    );
    this.subtitleDocumentController?.abort(
      abortError(undefined, "Subtitle request cancelled."),
    );
    this.thumbnailController?.abort(
      abortError(undefined, "Thumbnail request cancelled."),
    );
    this.handoffController?.abort(
      abortError(undefined, "Seekable handoff request cancelled."),
    );
    this.trackCatalogController = null;
    this.subtitleDocumentController = null;
    this.thumbnailController = null;
    this.handoffController = null;
    this.audioTracks = [];
    this.subtitleTracks = [];
    this.subtitleDocumentIds.clear();
    this.listeners.clear();
  }

  private assertActive() {
    if (this.stopped)
      throw new Error("The bridge runtime is no longer active.");
  }

  private emit<K extends keyof StreamEngineEventMap>(
    event: K,
    data: StreamEngineEventMap[K],
  ) {
    const callbacks = this.listeners.get(event);
    if (!callbacks || this.stopped) return;
    for (const callback of Array.from(callbacks)) {
      try {
        callback(data);
      } catch {
        // Runtime observers cannot interrupt or own the active source.
      }
    }
  }

  private emitTracks() {
    this.emit("tracks", {
      audioTracks: this.getAudioTracks(),
      subtitles: this.getSubtitles(),
    });
  }

  private applyTrackCatalog(catalog: BridgeTrackCatalogV1) {
    if (
      catalog.jobId !== this.jobId ||
      (this.boundMediaId !== null && catalog.mediaId !== this.boundMediaId)
    ) {
      throw invalidCatalog();
    }

    const supportedAudio = catalog.tracks.filter(
      (track) => track.kind === "audio" && track.supported,
    );
    const audioIds = new Set(supportedAudio.map((track) => track.id));
    const usableSubtitles = catalog.subtitles.filter(
      (subtitle) => subtitle.documentId !== undefined,
    );
    const subtitleIds = new Set(usableSubtitles.map((subtitle) => subtitle.id));
    if (
      audioIds.size !== supportedAudio.length ||
      subtitleIds.size !== usableSubtitles.length
    ) {
      throw invalidCatalog();
    }

    const selectedAudioId = this.audioTracks.find((track) => track.active)?.id;
    const defaultAudioId =
      supportedAudio.find((track) => track.id === selectedAudioId)?.id ??
      supportedAudio.find((track) => track.default)?.id ??
      supportedAudio[0]?.id;
    const selectedSubtitleId = this.subtitleTracks.find(
      (track) => track.active,
    )?.id;

    const nextAudioTracks = supportedAudio.map((track) =>
      this.mapAudioTrack(track, defaultAudioId),
    );
    const nextSubtitleDocuments = new Map<string, string>();
    const nextSubtitleTracks = usableSubtitles.map((subtitle) => {
      nextSubtitleDocuments.set(subtitle.id, subtitle.documentId!);
      return {
        id: subtitle.id,
        label: subtitle.label,
        language: subtitle.language,
        active: subtitle.id === selectedSubtitleId,
        format: subtitle.format,
        source: subtitle.source,
        forced: subtitle.forced,
        hearingImpaired: subtitle.hearingImpaired,
        providerName: subtitle.providerName,
        confidence: subtitle.confidence,
        contentIdMatch: subtitle.contentIdMatch,
      } satisfies SubtitleTrack;
    });

    this.boundMediaId = catalog.mediaId;
    this.audioTracks = nextAudioTracks;
    this.subtitleTracks = nextSubtitleTracks;
    this.subtitleDocumentIds = nextSubtitleDocuments;
    this.emitTracks();
  }

  private mapAudioTrack(
    track: NormalizedMediaTrack,
    activeId: string | undefined,
  ): AudioTrack {
    return {
      id: track.id,
      label: this.audioTrackLabel(track),
      language: track.language,
      active: track.id === activeId,
      codec: track.codec,
      channelCount: track.channelCount,
      channelLayout: track.channelLayout,
      audioDescription: track.audioDescription,
      commentary: track.commentary,
      source: track.source,
    };
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

  private scheduleMetricsPoll(delayMs: number) {
    if (
      this.stopped ||
      this.metricsTimer ||
      this.metricsController ||
      !this.listeners.has("stats")
    ) {
      return;
    }
    this.metricsTimer = setTimeout(() => {
      this.metricsTimer = null;
      void this.pollMetrics();
    }, delayMs);
  }

  private async pollMetrics() {
    if (this.stopped || !this.listeners.has("stats")) return;
    const controller = new AbortController();
    this.metricsController = controller;
    let nextDelay: number | null = this.metricsPollIntervalMs;
    try {
      const metrics = await this.client.getJobMetrics(
        this.jobId,
        controller.signal,
      );
      if (
        this.stopped ||
        controller.signal.aborted ||
        this.metricsController !== controller
      ) {
        return;
      }
      if (metrics.jobId !== this.jobId) {
        nextDelay = null;
        return;
      }
      const sampledAt = Date.parse(metrics.sampledAt);
      if (sampledAt > this.lastMetricsSampleAt) {
        this.lastMetricsSampleAt = sampledAt;
        this.emit("stats", {
          speed: metrics.downloadBytesPerSecond,
          peers: metrics.peers,
        });
      }
    } catch (error) {
      if (controller.signal.aborted || this.stopped) return;
      if (
        error instanceof BridgeClientError &&
        (error.code === "JOB_NOT_READY" || error.retryable)
      ) {
        nextDelay = Math.min(
          Math.max(error.retryAfterMs ?? this.metricsPollIntervalMs, 0),
          MAX_METRICS_RETRY_INTERVAL_MS,
        );
      } else {
        nextDelay = null;
      }
    } finally {
      if (this.metricsController === controller) {
        this.metricsController = null;
      }
      if (nextDelay !== null) this.scheduleMetricsPoll(nextDelay);
    }
  }

  private stopMetricsPolling() {
    if (this.metricsTimer) clearTimeout(this.metricsTimer);
    this.metricsTimer = null;
    this.metricsController?.abort(
      abortError(undefined, "Metrics request cancelled."),
    );
    this.metricsController = null;
  }

  private async getRuntimeLimits(signal?: AbortSignal): Promise<RuntimeLimits> {
    const capabilities = await awaitWithAbort(
      this.getCapabilities(),
      signal,
      "Bridge capabilities request cancelled.",
    );
    return {
      maxSubtitleBytes: Math.min(
        capabilities.limits.maxSubtitleBytes,
        BRIDGE_V1_CLIENT_MAX_SUBTITLE_BYTES,
      ),
      thumbnailBucketSeconds: Math.min(
        Math.max(capabilities.limits.thumbnailBucketSeconds, 1),
        MAX_CLIENT_THUMBNAIL_BUCKET_SECONDS,
      ),
      maxThumbnailBucket: Math.min(
        capabilities.limits.maxThumbnailBucket,
        MAX_CLIENT_THUMBNAIL_BUCKET,
      ),
      maxThumbnailBytes: Math.min(
        capabilities.limits.maxThumbnailBytes,
        BRIDGE_V1_CLIENT_MAX_THUMBNAIL_BYTES,
      ),
    };
  }

  private getCapabilities(): Promise<BridgeCapabilitiesV1> {
    if (this.capabilities) return Promise.resolve(this.capabilities);
    if (this.capabilitiesPromise) return this.capabilitiesPromise;
    this.capabilitiesPromise = this.client
      .getCapabilities(this.lifecycleController.signal)
      .then((capabilities) => {
        throwIfAborted(
          this.lifecycleController.signal,
          "Bridge runtime stopped.",
        );
        this.capabilities = capabilities;
        return capabilities;
      })
      .finally(() => {
        this.capabilitiesPromise = null;
      });
    return this.capabilitiesPromise;
  }
}
