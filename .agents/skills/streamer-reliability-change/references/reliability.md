# Resilience Standards

Use resilience controls to reduce a demonstrated failure or a clearly bounded
risk. More retries and more queues do not automatically improve reliability.

## Minimum Contract

- Every deadline has an owner and a cancellation path.
- Every retry has an eligibility rule, limit, delay policy, and budget.
- Every side effect has an idempotency or duplicate-handling strategy.
- Every queue or concurrent operation has a bound and backpressure behavior.
- Every degraded mode is explicit to the user or operator.
- Every temporary recovery path has an owner and retirement condition.

## Review Questions

- Can the same request be delivered twice?
- Which layer retries, and what happens when all attempts fail?
- What state is safe to persist after a partial failure?
- Can cancellation stop downstream work and release resources?
- What signal distinguishes dependency failure from product failure?
- What is the safest recovery when the dependency returns after a timeout?

## Primary References

- [Azure transient fault handling](https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults)
- [AWS reliability principles](https://docs.aws.amazon.com/wellarchitected/latest/framework/reliability.html)
- [Google SRE: cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
