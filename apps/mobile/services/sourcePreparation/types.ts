import type {
  PlaybackAction,
  PlaybackErrorCode,
  PlaybackExecutionTarget,
  PlaybackDelivery,
  PlaybackRoute,
  PlannedMediaCandidate,
  PlannedMediaCandidateV3,
  Stream,
} from "@streamer/shared";
import type {
  GatewayJobProgress,
  IStreamEngine,
} from "../streamEngine/IStreamEngine";

export interface SourcePreparationRequestBase {
  action: PlaybackAction;
  /** Opaque playback-attempt identity used to bind the runtime lease. */
  attemptId: string;
  /** Opaque UUID forwarded as the bridge v1 idempotency key. */
  requestId: string;
  signal?: AbortSignal;
  onGatewayProgress?: (progress: GatewayJobProgress) => void;
}

export interface RoutedSourcePreparationRequest extends SourcePreparationRequestBase {
  candidate: PlannedMediaCandidateV3;
  route: PlaybackRoute;
}

export interface LegacySourcePreparationRequest extends SourcePreparationRequestBase {
  candidate: PlannedMediaCandidate;
  route?: undefined;
}

export type SourcePreparationRequest =
  RoutedSourcePreparationRequest | LegacySourcePreparationRequest;

export interface SourcePreparationRouteBinding {
  executionTarget: PlaybackExecutionTarget;
  delivery: PlaybackDelivery;
}

export interface PreparedSource {
  /** Runtime-only media location. Never persist, log, cache, or breadcrumb. */
  readonly uri: string;
  /** Runtime-only source copy. Never persist or emit to telemetry. */
  readonly stream: Stream;
  readonly attemptId: string;
  readonly route?: PlaybackRoute;
  /** Opaque runtime bridge identity for cast and lifecycle integration. */
  readonly bridgeJobId?: string;
  /** Transitional engine handle for tracks and player handoff. */
  readonly runtime?: IStreamEngine;
  readonly released: boolean;
  /** Idempotently releases every resource owned by this prepared source. */
  release(): Promise<void>;
}

export interface SourcePreparationAdapter {
  readonly routes: readonly SourcePreparationRouteBinding[];
  prepare(request: RoutedSourcePreparationRequest): Promise<PreparedSource>;
}

export interface LegacySourcePreparationAdapter {
  prepare(request: LegacySourcePreparationRequest): Promise<PreparedSource>;
}

export type SourcePreparationErrorCode =
  PlaybackErrorCode | "UNSUPPORTED_ROUTE" | "INVALID_SOURCE" | "CANCELLED";

const retryableCodes = new Set<SourcePreparationErrorCode>([
  "NO_PEERS",
  "BRIDGE_UNAVAILABLE",
  "GATEWAY_TIMEOUT",
  "SOURCE_UNAVAILABLE",
  "NETWORK_OFFLINE",
  "PLAYBACK_TIMEOUT",
  "UNKNOWN",
]);

const fallbackCodes = new Set<SourcePreparationErrorCode>([
  "NO_PEERS",
  "GATEWAY_TIMEOUT",
  "SOURCE_UNAVAILABLE",
  "NETWORK_OFFLINE",
  "PLAYBACK_TIMEOUT",
  "UNKNOWN",
]);

export class SourcePreparationError extends Error {
  readonly code: SourcePreparationErrorCode;
  readonly retryable: boolean;
  readonly shouldFallback: boolean;
  readonly isCancellation: boolean;

  constructor(
    code: SourcePreparationErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      shouldFallback?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "SourcePreparationError";
    this.code = code;
    this.retryable = options.retryable ?? retryableCodes.has(code);
    this.shouldFallback = options.shouldFallback ?? fallbackCodes.has(code);
    this.isCancellation = code === "CANCELLED";
  }
}

export function isSourcePreparationError(
  error: unknown,
): error is SourcePreparationError {
  return error instanceof SourcePreparationError;
}

export function cancellationError(cause?: unknown) {
  return new SourcePreparationError(
    "CANCELLED",
    "Source preparation was cancelled.",
    { retryable: false, shouldFallback: false, cause },
  );
}

export function isAbortError(error: unknown, signal?: AbortSignal) {
  return (
    signal?.aborted === true ||
    (!!error &&
      typeof error === "object" &&
      ((error as { name?: unknown }).name === "AbortError" ||
        (error as { isCancellation?: unknown }).isCancellation === true))
  );
}

export function throwIfPreparationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw cancellationError(signal.reason);
  }
}

/**
 * Await work that may not honor AbortSignal while still returning cancellation
 * promptly. A late successful value can be cleaned up without reviving the
 * cancelled attempt.
 */
export function awaitWithPreparationAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  onLateValue?: (value: T) => void | Promise<void>,
): Promise<T> {
  if (!signal) return promise;

  if (signal.aborted) {
    void promise.then(onLateValue).catch(() => undefined);
    return Promise.reject(cancellationError(signal.reason));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(cancellationError(signal.reason));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) {
          void Promise.resolve(onLateValue?.(value)).catch(() => undefined);
          return;
        }
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

export interface PreparedSourceLeaseInput {
  uri: string;
  stream: Stream;
  attemptId: string;
  route?: PlaybackRoute;
  bridgeJobId?: string;
  runtime?: IStreamEngine;
  release?: () => void | Promise<void>;
}

/** Runtime-only, single-owner lease with idempotent asynchronous cleanup. */
export class PreparedSourceLease implements PreparedSource {
  readonly uri: string;
  readonly stream: Stream;
  readonly attemptId: string;
  readonly route?: PlaybackRoute;
  readonly bridgeJobId?: string;
  readonly runtime?: IStreamEngine;
  private readonly releaseOwnedResources: () => void | Promise<void>;
  private releasePromise: Promise<void> | null = null;

  constructor(input: PreparedSourceLeaseInput) {
    this.uri = input.uri;
    this.stream = input.stream;
    this.attemptId = input.attemptId;
    this.route = input.route;
    this.bridgeJobId = input.bridgeJobId;
    this.runtime = input.runtime;
    this.releaseOwnedResources = input.release ?? (() => undefined);
  }

  get released() {
    return this.releasePromise !== null;
  }

  release(): Promise<void> {
    if (!this.releasePromise) {
      let resolveRelease!: () => void;
      let rejectRelease!: (error: unknown) => void;
      this.releasePromise = new Promise<void>((resolve, reject) => {
        resolveRelease = resolve;
        rejectRelease = reject;
      });
      try {
        Promise.resolve(this.releaseOwnedResources()).then(
          resolveRelease,
          rejectRelease,
        );
      } catch (error) {
        rejectRelease(error);
      }
    }
    return this.releasePromise;
  }
}
