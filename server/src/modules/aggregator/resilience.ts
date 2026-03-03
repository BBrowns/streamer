import {
    ConsecutiveBreaker,
    ExponentialBackoff,
    handleAll,
    retry,
    circuitBreaker,
    timeout,
    TimeoutStrategy,
    wrap,
    bulkhead,
    type IPolicy,
} from 'cockatiel';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

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

const metricsMap = new Map<string, ResilienceMetrics>();

function getMetrics(addonId: string): ResilienceMetrics {
    let m = metricsMap.get(addonId);
    if (!m) {
        m = { timeouts: 0, retries: 0, circuitOpens: 0, bulkheadRejections: 0, lastFailure: null };
        metricsMap.set(addonId, m);
    }
    return m;
}

/** Get current metrics for an add-on (read-only). */
export function getAddonMetrics(addonId: string): Readonly<ResilienceMetrics> | undefined {
    return metricsMap.get(addonId);
}

/** Get all add-on metrics (for observability endpoints). */
export function getAllAddonMetrics(): ReadonlyMap<string, Readonly<ResilienceMetrics>> {
    return metricsMap;
}

/**
 * Create a resilience policy for outbound add-on requests.
 *
 * Implements the "Fail-Fast, Recover-Quickly" strategy:
 * 1. **Timeout**: 5s per request (aggressive — cancels immediately)
 * 2. **Retry**: 1 retry with exponential backoff (500ms → 2s)
 * 3. **Circuit Breaker**: Opens after 3 consecutive failures, half-open after 15s
 * 4. **Bulkhead**: Limits concurrent requests per add-on to prevent resource exhaustion
 */
export function createAddonPolicy(addonId: string): IPolicy {
    const metrics = getMetrics(addonId);

    // Timeout: configurable, defaults to 5 seconds
    const timeoutPolicy = timeout(env.addonTimeoutMs, TimeoutStrategy.Aggressive);

    timeoutPolicy.onTimeout(() => {
        metrics.timeouts++;
        metrics.lastFailure = new Date();
        logger.debug({ addonId, totalTimeouts: metrics.timeouts }, 'Add-on request timed out');
    });

    // Retry: 1 retry on failure with exponential backoff
    const retryPolicy = retry(handleAll, {
        maxAttempts: 1,
        backoff: new ExponentialBackoff({ initialDelay: 500, maxDelay: 2000 }),
    });

    retryPolicy.onRetry(({ attempt }) => {
        metrics.retries++;
        logger.debug({ addonId, attempt, totalRetries: metrics.retries }, 'Retrying add-on request');
    });

    // Circuit breaker: opens after 3 consecutive failures, half-open after 15s
    const breakerPolicy = circuitBreaker(handleAll, {
        halfOpenAfter: 15_000,
        breaker: new ConsecutiveBreaker(3),
    });

    breakerPolicy.onStateChange((state) => {
        const stateStr = String(state);
        if (stateStr === 'open') {
            metrics.circuitOpens++;
            metrics.lastFailure = new Date();
        }
        logger.warn(
            { addonId, circuitState: stateStr, totalOpens: metrics.circuitOpens },
            `Circuit breaker → ${stateStr}`,
        );
    });

    // Bulkhead: limit concurrent outbound requests per add-on
    const bulkheadPolicy = bulkhead(env.addonMaxConcurrent, 20);

    bulkheadPolicy.onReject(() => {
        metrics.bulkheadRejections++;
        metrics.lastFailure = new Date();
        logger.warn(
            { addonId, totalRejections: metrics.bulkheadRejections },
            'Bulkhead rejected request — add-on concurrency limit reached',
        );
    });

    // Wrap policies: bulkhead → timeout → retry → circuit breaker
    return wrap(bulkheadPolicy, timeoutPolicy, retryPolicy, breakerPolicy);
}

/** Reset all metrics — for testing only. */
export function _resetMetrics(): void {
    metricsMap.clear();
}
