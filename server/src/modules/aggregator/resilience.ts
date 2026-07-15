import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleWhen,
  retry,
  circuitBreaker,
  timeout,
  TimeoutStrategy,
  wrap,
  bulkhead,
  type IPolicy,
} from "cockatiel";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/**
 * Resilience metrics per add-on.
 * Exposed for observability and testing.
 */
export interface ResilienceMetrics {
  timeouts: number;
  retries: number;
  circuitOpens: number;
  bulkheadRejections: number;
  lastFailure: Date | null;
}

/**
 * Marks an expected upstream outcome that must pass through resilience
 * policies without being retried or counted as a circuit-breaker failure.
 */
export class NonRetryableUpstreamError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "NonRetryableUpstreamError";
    this.cause = cause;
  }
}

export class ResilienceRegistry {
  private policies = new Map<string, IPolicy>();
  private metrics = new Map<string, ResilienceMetrics>();
  /** Track last access time for LRU eviction */
  private accessLog = new Map<string, number>();
  private readonly maxEntries = env.nodeEnv === "test" ? 100 : 1000;

  constructor() {}

  /** Get a policy for an add-on, creating it if needed. */
  getPolicy(addonId: string): IPolicy {
    this.accessLog.set(addonId, Date.now());

    let policy = this.policies.get(addonId);
    if (!policy) {
      this.evictIfFull();
      policy = this.createPolicy(addonId);
      this.policies.set(addonId, policy);
    }

    return policy;
  }

  /** Get metrics for an add-on. */
  getMetrics(addonId: string): ResilienceMetrics {
    let m = this.metrics.get(addonId);
    if (!m) {
      m = {
        timeouts: 0,
        retries: 0,
        circuitOpens: 0,
        bulkheadRejections: 0,
        lastFailure: null,
      };
      this.metrics.set(addonId, m);
    }
    return m;
  }

  /** Get all metrics summary. */
  getAllMetrics(): Record<string, ResilienceMetrics> {
    const result: Record<string, ResilienceMetrics> = {};
    for (const [id, m] of this.metrics.entries()) {
      result[id] = m;
    }
    return result;
  }

  /** Evict the least recently used entry if at capacity. */
  private evictIfFull(): void {
    if (this.policies.size < this.maxEntries) return;

    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, time] of this.accessLog.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.policies.delete(oldestId);
      this.accessLog.delete(oldestId);
      // We keep the metrics even if policy is evicted for long-term tracking
      // but maybe we should prune those too if they are very old?
      // For now, just policies (which hold the expensive state like circuit breaker instances).
      logger.debug(
        { addonId: oldestId },
        "Evicting resilience policy from registry (LRU)",
      );
    }
  }

  private createPolicy(addonId: string): IPolicy {
    const metrics = this.getMetrics(addonId);
    const retryableFailures = handleWhen(
      (error) => !(error instanceof NonRetryableUpstreamError),
    );

    // Timeout: configurable, defaults to 5 seconds
    const timeoutPolicy = timeout(
      env.addonTimeoutMs,
      TimeoutStrategy.Aggressive,
    );
    timeoutPolicy.onTimeout(() => {
      metrics.timeouts++;
      metrics.lastFailure = new Date();
      logger.debug({ addonId }, "Resilience: Timeout triggered");
    });

    // Retry: 1 attempt on failure
    const retryPolicy = retry(retryableFailures, {
      maxAttempts: 1,
      backoff: new ExponentialBackoff({ initialDelay: 500, maxDelay: 2000 }),
    });
    retryPolicy.onRetry(({ attempt }) => {
      metrics.retries++;
    });

    // Circuit breaker: opens after 3 consecutive failures
    const breakerPolicy = circuitBreaker(retryableFailures, {
      halfOpenAfter: 15_000,
      breaker: new ConsecutiveBreaker(3),
    });
    breakerPolicy.onStateChange((state) => {
      const s = String(state);
      if (s === "open") {
        metrics.circuitOpens++;
        metrics.lastFailure = new Date();
      }
      logger.warn(
        { addonId, state: s },
        "Resilience: Circuit breaker state changed",
      );
    });

    // Bulkhead: limit concurrent outbound requests
    const bulkheadPolicy = bulkhead(env.addonMaxConcurrent, 20);
    bulkheadPolicy.onReject(() => {
      metrics.bulkheadRejections++;
    });

    return wrap(bulkheadPolicy, timeoutPolicy, retryPolicy, breakerPolicy);
  }

  reset(): void {
    this.policies.clear();
    this.metrics.clear();
    this.accessLog.clear();
  }
}

export const resilienceRegistry = new ResilienceRegistry();
