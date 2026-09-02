import {
  validateActionBridgeUrl,
  type BridgeDelivery,
  type BridgeJobResponseV1,
  type BridgeJobV1,
  type CreateBridgeJobV1,
  type PlaybackExecutionTarget,
} from "@streamer/shared";
import {
  BridgeClientError,
  getBridgeClient,
  type BridgeClientErrorCode,
} from "../../bridge/BridgeClient";
import {
  BridgeV1PlaybackRuntime,
  type BridgeV1PlaybackRuntimeClient,
} from "../../bridge/BridgeV1PlaybackRuntime";
import { bindBridgeV1StreamUri } from "../../bridge/BridgeV1StreamGuard";
import type { GatewayJobProgress } from "../../streamEngine/IStreamEngine";
import { recordPlaybackDebugEvent } from "../../playback/playbackDebug";
import {
  PreparedSourceLease,
  SourcePreparationError,
  awaitWithPreparationAbort,
  cancellationError,
  isAbortError,
  throwIfPreparationAborted,
  type RoutedSourcePreparationRequest,
  type SourcePreparationAdapter,
  type SourcePreparationRouteBinding,
} from "../types";

const BRIDGE_DELIVERIES = [
  "range-http",
  "progressive-fmp4",
  "seekable-cache",
  "hls",
] as const satisfies readonly BridgeDelivery[];
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_TRACKERS = [
  "http://tracker.opentrackr.org:1337/announce",
  "http://tracker.renhas.cl:6969/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://tracker.internetwarriors.net:1337/announce",
  "udp://tracker.leechers-paradise.org:6969/announce",
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.fastcast.nz",
] as const;
const NON_FALLBACKABLE_BRIDGE_ERROR_CODES = new Set<BridgeClientErrorCode>([
  "INVALID_REQUEST",
  "PROTOCOL_UNSUPPORTED",
  "IDEMPOTENCY_CONFLICT",
  "DELIVERY_UNSUPPORTED",
  "BRIDGE_RESPONSE_INVALID",
]);

type BridgeExecutionTarget = Extract<
  PlaybackExecutionTarget,
  "local-sidecar" | "paired-bridge"
>;

export interface BridgeV1Client extends BridgeV1PlaybackRuntimeClient {
  createJob(
    input: CreateBridgeJobV1,
    signal?: AbortSignal,
  ): Promise<BridgeJobResponseV1>;
  cancelJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<BridgeJobResponseV1 | null>;
}

export interface BridgeV1SourceAdapterOptions {
  executionTarget: BridgeExecutionTarget;
  /** Runtime-only local/LAN endpoint. Never expose this in planner payloads. */
  baseUrl: string;
  client?: BridgeV1Client;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function isBridgeDelivery(value: string): value is BridgeDelivery {
  return (BRIDGE_DELIVERIES as readonly string[]).includes(value);
}

function isCompatibleDeliveryUpgrade(
  requested: BridgeDelivery,
  previous: BridgeDelivery,
  observed: BridgeDelivery,
) {
  return (
    requested === "range-http" &&
    previous === "range-http" &&
    (observed === "seekable-cache" ||
      observed === "progressive-fmp4" ||
      observed === "hls")
  );
}

function isCompatibleRuntimeDeliveryDowngrade(
  requested: BridgeDelivery,
  previous: BridgeDelivery,
  observed: BridgeDelivery,
) {
  // A runtime probe may prove that a planner's unknown torrent is already a
  // directly playable MP4. The gateway can then switch the same job to
  // range-http without making the client retry the source as a protocol
  // violation. This is only valid for the two remux-capable Play deliveries;
  // downloads/cast and arbitrary delivery changes remain strict.
  return (
    (requested === "hls" || requested === "progressive-fmp4") &&
    previous === requested &&
    observed === "range-http"
  );
}

function defaultSleep(milliseconds: number, signal?: AbortSignal) {
  throwIfPreparationAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(cancellationError(signal?.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function notifyGatewayProgress(
  callback: ((progress: GatewayJobProgress) => void) | undefined,
  progress: GatewayJobProgress,
) {
  try {
    callback?.(progress);
  } catch {
    // Observers are not allowed to interrupt or own preparation.
  }
}

function buildMagnet(infoHash: string | undefined) {
  const normalized = infoHash?.trim();
  if (!normalized || !/^(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(normalized)) {
    throw new SourcePreparationError(
      "INVALID_SOURCE",
      "The torrent source does not contain a valid source identity.",
    );
  }

  const trackers = DEFAULT_TRACKERS.map(
    (tracker) => `tr=${encodeURIComponent(tracker)}`,
  ).join("&");
  return `magnet:?xt=urn:btih:${normalized.toLowerCase()}&${trackers}`;
}

function buildSelection(
  stream: RoutedSourcePreparationRequest["candidate"]["stream"],
) {
  const selection = {
    fileIndex: stream.fileIdx,
    title: stream.fileSelectionHints?.title,
    season: stream.fileSelectionHints?.season,
    episode: stream.fileSelectionHints?.episode,
  };
  return Object.values(selection).some((value) => value !== undefined)
    ? selection
    : undefined;
}

function progressFromJob(job: BridgeJobV1): GatewayJobProgress {
  return {
    id: job.id,
    state: job.state,
    phase: job.phase,
    progress: job.readinessProgress,
    peerCount: job.peerCount,
    error: job.failure?.message,
    retryable: job.failure?.retryable,
    elapsedMs: job.elapsedMs,
    readyTimeoutMs: job.readyTimeoutMs,
  };
}

function bridgeJobUnavailableError(cause?: unknown) {
  return new SourcePreparationError(
    "SOURCE_UNAVAILABLE",
    "The bridge job disappeared before the source was ready.",
    { retryable: true, shouldFallback: true, cause },
  );
}

function terminalJobError(job: BridgeJobV1): SourcePreparationError | null {
  switch (job.state) {
    case "preparing":
    case "ready":
      return null;
    case "no_peers":
      return new SourcePreparationError(
        "NO_PEERS",
        "The bridge could not find peers for this source.",
        { retryable: true, shouldFallback: true },
      );
    case "stalled":
      return new SourcePreparationError(
        "SOURCE_STALLED",
        "The bridge stalled while preparing this source.",
        { retryable: true, shouldFallback: true },
      );
    case "cancelled":
      return cancellationError();
    case "expired":
      return new SourcePreparationError(
        "SOURCE_UNAVAILABLE",
        "The bridge job expired before the source was ready.",
      );
    case "error":
      if (job.failure?.code === "JOB_NOT_FOUND") {
        return bridgeJobUnavailableError();
      }
      if (
        (job.failure?.code &&
          NON_FALLBACKABLE_BRIDGE_ERROR_CODES.has(job.failure.code)) ||
        job.failure?.code === "RUNTIME_UNAVAILABLE"
      ) {
        return bridgeContractError(
          "The bridge cannot execute the selected playback route.",
        );
      }
      if (job.failure?.code === "TRACKS_UNAVAILABLE") {
        return new SourcePreparationError(
          "TRACKS_UNAVAILABLE",
          "English audio is unavailable for this source.",
          {
            retryable: job.failure?.retryable ?? true,
            shouldFallback: true,
          },
        );
      }
      return new SourcePreparationError(
        "INTERNAL",
        "The bridge could not prepare this source.",
        {
          retryable: job.failure?.retryable ?? false,
          shouldFallback: true,
        },
      );
  }
}

function bridgeContractError(message: string, cause?: unknown) {
  return new SourcePreparationError("BRIDGE_UNSUPPORTED", message, {
    retryable: false,
    shouldFallback: false,
    cause,
  });
}

function assertReadyJobMedia(job: BridgeJobV1) {
  const { delivery, media } = job;
  let valid = false;

  switch (delivery) {
    case "range-http":
      valid =
        !media.remuxed &&
        media.seek === "immediate" &&
        media.seekableCache === undefined;
      break;
    case "progressive-fmp4": {
      const cacheStatus = media.seekableCache?.status;
      valid =
        media.remuxed &&
        media.container === "mp4" &&
        cacheStatus !== undefined &&
        ((cacheStatus === "ready" && media.seek === "immediate") ||
          (cacheStatus !== "ready" && media.seek === "preparing"));
      break;
    }
    case "seekable-cache":
      valid =
        media.remuxed &&
        media.container === "mp4" &&
        media.seek === "immediate" &&
        media.seekableCache?.status === "ready";
      break;
    case "hls":
      valid =
        media.remuxed &&
        media.container === "mp4" &&
        media.seek === "immediate" &&
        media.seekableCache === undefined;
      break;
  }

  if (!valid) {
    throw bridgeContractError(
      "The bridge ready state does not match the selected delivery.",
    );
  }
}

function mapBridgeClientError(error: unknown, signal?: AbortSignal) {
  if (error instanceof SourcePreparationError) return error;
  if (isAbortError(error, signal)) return cancellationError(error);
  if (!(error instanceof BridgeClientError)) {
    return new SourcePreparationError(
      "BRIDGE_UNAVAILABLE",
      "The bridge could not be reached while preparing this source.",
      { cause: error },
    );
  }

  if (error.code === "NO_PEERS") {
    return new SourcePreparationError(
      "NO_PEERS",
      "The bridge could not find peers for this source.",
      { retryable: error.retryable, shouldFallback: true, cause: error },
    );
  }
  if (error.code === "SOURCE_STALLED") {
    return new SourcePreparationError(
      "SOURCE_STALLED",
      "The bridge stalled while preparing this source.",
      { retryable: error.retryable, shouldFallback: true, cause: error },
    );
  }
  if (error.code === "JOB_NOT_FOUND") {
    return bridgeJobUnavailableError(error);
  }
  if (NON_FALLBACKABLE_BRIDGE_ERROR_CODES.has(error.code)) {
    return bridgeContractError(
      "The bridge response does not match the selected playback route.",
      error,
    );
  }
  if (error.code === "RUNTIME_UNAVAILABLE") {
    return new SourcePreparationError(
      "BRIDGE_UNSUPPORTED",
      "The bridge cannot execute the selected playback route.",
      { retryable: error.retryable, shouldFallback: false, cause: error },
    );
  }
  if (error.code === "TRACKS_UNAVAILABLE") {
    return new SourcePreparationError(
      "TRACKS_UNAVAILABLE",
      "English audio is unavailable for this source.",
      {
        retryable: error.retryable,
        shouldFallback: true,
        cause: error,
      },
    );
  }
  if (
    error.code === "BRIDGE_UNREACHABLE" ||
    error.code === "AUTH_REQUIRED" ||
    error.code === "AUTH_NOT_CONFIGURED" ||
    error.code === "FORBIDDEN"
  ) {
    return new SourcePreparationError(
      "BRIDGE_UNAVAILABLE",
      "The bridge is unavailable for source preparation.",
      { retryable: error.retryable, shouldFallback: false, cause: error },
    );
  }
  return new SourcePreparationError(
    "INTERNAL",
    "The bridge could not prepare this source.",
    { retryable: error.retryable, shouldFallback: true, cause: error },
  );
}

export class BridgeV1SourceAdapter implements SourcePreparationAdapter {
  readonly routes: readonly SourcePreparationRouteBinding[];
  private readonly executionTarget: BridgeExecutionTarget;
  private readonly baseOrigin: string;
  private readonly client: BridgeV1Client;
  private readonly pollIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;

  constructor(options: BridgeV1SourceAdapterOptions) {
    const validation = validateActionBridgeUrl(options.baseUrl);
    if (!validation.ok || !validation.url) {
      throw new SourcePreparationError(
        "BRIDGE_UNAVAILABLE",
        "The configured bridge endpoint is invalid.",
        { retryable: false, shouldFallback: false },
      );
    }
    if (
      (options.executionTarget === "local-sidecar" &&
        validation.scope !== "loopback") ||
      (options.executionTarget === "paired-bridge" &&
        validation.scope !== "lan")
    ) {
      throw new SourcePreparationError(
        "BRIDGE_UNAVAILABLE",
        "The configured bridge endpoint does not match its execution target.",
        { retryable: false, shouldFallback: false },
      );
    }
    if (
      options.pollIntervalMs !== undefined &&
      (!Number.isFinite(options.pollIntervalMs) || options.pollIntervalMs < 0)
    ) {
      throw new SourcePreparationError(
        "INVALID_SOURCE",
        "The bridge polling interval is invalid.",
        { retryable: false, shouldFallback: false },
      );
    }

    this.executionTarget = options.executionTarget;
    this.baseOrigin = new URL(validation.url).origin;
    this.client = options.client ?? getBridgeClient(this.baseOrigin);
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.routes = BRIDGE_DELIVERIES.map((delivery) => ({
      executionTarget: this.executionTarget,
      delivery,
    }));
  }

  async prepare(request: RoutedSourcePreparationRequest) {
    const delivery = request.route.delivery;
    if (
      request.route.executionTarget !== this.executionTarget ||
      !isBridgeDelivery(delivery)
    ) {
      throw new SourcePreparationError(
        "UNSUPPORTED_ROUTE",
        "The bridge adapter cannot execute the selected route.",
        { retryable: false, shouldFallback: false },
      );
    }
    if (request.candidate.kind !== "torrent") {
      throw new SourcePreparationError(
        "INVALID_SOURCE",
        "Bridge source preparation requires a torrent source.",
      );
    }
    throwIfPreparationAborted(request.signal);

    const cancelledJobIds = new Set<string>();
    const cancelJobOnce = async (jobId: string) => {
      if (cancelledJobIds.has(jobId)) return;
      cancelledJobIds.add(jobId);
      try {
        await this.client.cancelJob(jobId);
      } catch {
        // Cleanup is best effort and must not replace the preparation result.
      }
    };
    let activeJobId: string | undefined;

    notifyGatewayProgress(request.onGatewayProgress, {
      state: "preparing",
      phase: "creating_gateway_job",
      progress: null,
      peerCount: null,
    });
    throwIfPreparationAborted(request.signal);

    try {
      const selection = buildSelection(request.candidate.stream);
      const createInput: CreateBridgeJobV1 = {
        requestId: request.requestId,
        source: {
          kind: "magnet",
          magnet: buildMagnet(request.candidate.stream.infoHash),
        },
        delivery,
        ...(selection ? { selection } : {}),
      };
      recordPlaybackDebugEvent({
        category: "gateway",
        message: "gateway.job_create_started",
        data: {
          executionTarget: this.executionTarget,
          delivery,
          attemptId: request.attemptId,
        },
      });
      let response = await awaitWithPreparationAbort(
        this.client.createJob(createInput, request.signal),
        request.signal,
        (lateResponse) => cancelJobOnce(lateResponse.job.id),
      );
      activeJobId = response.job.id;
      throwIfPreparationAborted(request.signal);
      let effectiveDelivery = this.assertJobBinding(
        response.job,
        delivery,
        delivery,
      );
      recordPlaybackDebugEvent({
        category: "gateway",
        message: "gateway.job_created",
        data: {
          jobId: response.job.id,
          delivery: response.job.delivery,
          state: response.job.state,
          phase: response.job.phase,
        },
      });

      let job = response.job;
      let authoritativeReadyTimeoutMs = job.readyTimeoutMs;
      let deadline =
        this.now() + Math.max(0, job.readyTimeoutMs - job.elapsedMs);
      while (true) {
        notifyGatewayProgress(request.onGatewayProgress, progressFromJob(job));
        throwIfPreparationAborted(request.signal);

        const terminalError = terminalJobError(job);
        if (terminalError) throw terminalError;
        if (
          job.elapsedMs >= authoritativeReadyTimeoutMs ||
          this.now() >= deadline
        ) {
          throw new SourcePreparationError(
            "GATEWAY_TIMEOUT",
            "The bridge took too long to prepare this source.",
            { retryable: true, shouldFallback: true },
          );
        }

        if (job.state === "ready") {
          assertReadyJobMedia(job);
          let uri: string;
          try {
            uri = bindBridgeV1StreamUri({
              baseOrigin: this.baseOrigin,
              job,
              now: this.now(),
            });
          } catch (error) {
            throw bridgeContractError(
              "The bridge returned an invalid stream path.",
              error,
            );
          }
          throwIfPreparationAborted(request.signal);
          const runtime = new BridgeV1PlaybackRuntime({
            client: this.client,
            baseOrigin: this.baseOrigin,
            jobId: job.id,
            delivery: effectiveDelivery,
            initialUri: uri,
            now: this.now,
          });
          const effectiveRoute =
            effectiveDelivery === request.route.delivery
              ? request.route
              : {
                  ...request.route,
                  delivery: effectiveDelivery,
                  capabilities: {
                    ...request.route.capabilities,
                    seek: job.media.seek,
                  },
                };
          return new PreparedSourceLease({
            uri,
            stream: { ...request.candidate.stream, url: uri },
            attemptId: request.attemptId,
            route: effectiveRoute,
            bridgeJobId: job.id,
            runtime,
            release: async () => {
              runtime.stop();
              await cancelJobOnce(job.id);
            },
          });
        }

        const remainingMs = Math.max(0, deadline - this.now());
        await this.sleep(
          Math.min(this.pollIntervalMs, remainingMs),
          request.signal,
        );
        throwIfPreparationAborted(request.signal);
        if (this.now() >= deadline) {
          throw new SourcePreparationError(
            "GATEWAY_TIMEOUT",
            "The bridge took too long to prepare this source.",
            { retryable: true, shouldFallback: true },
          );
        }
        response = await awaitWithPreparationAbort(
          this.client.getJob(job.id, request.signal),
          request.signal,
        );
        throwIfPreparationAborted(request.signal);
        const previousDelivery = effectiveDelivery;
        effectiveDelivery = this.assertJobBinding(
          response.job,
          delivery,
          effectiveDelivery,
          job.id,
        );
        if (
          isCompatibleDeliveryUpgrade(
            delivery,
            previousDelivery,
            effectiveDelivery,
          ) &&
          response.job.readyTimeoutMs > authoritativeReadyTimeoutMs
        ) {
          authoritativeReadyTimeoutMs = response.job.readyTimeoutMs;
          deadline = Math.max(
            deadline,
            this.now() +
              Math.max(0, response.job.readyTimeoutMs - response.job.elapsedMs),
          );
        }
        job = response.job;
      }
    } catch (error) {
      recordPlaybackDebugEvent({
        category: "gateway",
        message: "gateway.job_failed",
        level: "warning",
        data: {
          executionTarget: this.executionTarget,
          delivery,
          attemptId: request.attemptId,
          errorCode:
            error instanceof BridgeClientError
              ? error.code
              : error instanceof SourcePreparationError
                ? error.code
                : "UNKNOWN",
          httpStatus:
            error instanceof BridgeClientError ? error.status : undefined,
        },
      });
      if (activeJobId) await cancelJobOnce(activeJobId);
      throw mapBridgeClientError(error, request.signal);
    }
  }

  private assertJobBinding(
    job: BridgeJobV1,
    requestedDelivery: BridgeDelivery,
    previousDelivery: BridgeDelivery,
    expectedJobId?: string,
  ): BridgeDelivery {
    if (
      !job.id ||
      (job.delivery !== previousDelivery &&
        !(
          isCompatibleDeliveryUpgrade(
            requestedDelivery,
            previousDelivery,
            job.delivery,
          ) ||
          isCompatibleRuntimeDeliveryDowngrade(
            requestedDelivery,
            previousDelivery,
            job.delivery,
          )
        )) ||
      (expectedJobId !== undefined && job.id !== expectedJobId)
    ) {
      throw bridgeContractError(
        "The bridge response does not match the active preparation attempt.",
      );
    }
    return job.delivery;
  }
}
