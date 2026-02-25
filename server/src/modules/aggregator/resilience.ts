import {
    CircuitBreakerPolicy,
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
 * Create a resilience policy for outbound add-on requests.
 *
 * Implements the "Fail-Fast, Recover-Quickly" strategy:
 * 1. **Timeout**: 5s per request (aggressive — cancels immediately)
 * 2. **Retry**: 1 retry with exponential backoff (500ms → 2s)
 * 3. **Circuit Breaker**: Opens after 3 consecutive failures, half-open after 15s
 * 4. **Bulkhead**: Limits concurrent requests per add-on to prevent resource exhaustion
 */
export function createAddonPolicy(addonId: string): IPolicy {
    // Timeout: configurable, defaults to 5 seconds
    const timeoutPolicy = timeout(env.addonTimeoutMs, TimeoutStrategy.Aggressive);

    // Retry: 1 retry on failure with exponential backoff
    const retryPolicy = retry(handleAll, {
        maxAttempts: 1,
        backoff: new ExponentialBackoff({ initialDelay: 500, maxDelay: 2000 }),
    });

    // Circuit breaker: opens after 3 consecutive failures, half-open after 15s
    const breakerPolicy = circuitBreaker(handleAll, {
        halfOpenAfter: 15_000,
        breaker: new ConsecutiveBreaker(3),
    });

    breakerPolicy.onStateChange((state) => {
        logger.warn({ addonId, circuitState: state }, 'Circuit breaker state changed');
    });

    // Bulkhead: limit concurrent outbound requests per add-on
    const bulkheadPolicy = bulkhead(env.addonMaxConcurrent, 20); // max concurrent, max queue

    bulkheadPolicy.onReject(() => {
        logger.warn({ addonId }, 'Bulkhead rejected request — add-on concurrency limit reached');
    });

    // Wrap policies: bulkhead → timeout → retry → circuit breaker
    return wrap(bulkheadPolicy, timeoutPolicy, retryPolicy, breakerPolicy);
}
