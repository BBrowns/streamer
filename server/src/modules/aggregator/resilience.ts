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
    type IPolicy,
} from 'cockatiel';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/** Create a resilience policy for outbound add-on requests */
export function createAddonPolicy(addonId: string): IPolicy {
    // Timeout: 5 seconds per request
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

    // Wrap policies: timeout → retry → circuit breaker
    return wrap(timeoutPolicy, retryPolicy, breakerPolicy);
}
