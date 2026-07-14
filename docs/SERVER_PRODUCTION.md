# Server Production Runtime

The API server supports an explicit single-instance baseline and a
Redis-backed multi-instance mode. Production configuration is validated before
the HTTP listener starts. Invalid configuration exits non-zero and does not
accept requests.

## Required Production Configuration

At minimum, set:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://user:password@database:5432/streamer
JWT_SECRET=<at-least-32-random-characters>
SERVER_INSTANCE_MODE=single
CORS_ORIGINS=https://app.example.com
APP_URL_WEB=https://app.example.com
APP_URL_DEEPLINK=streamer://
EMAIL_DELIVERY_MODE=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM=noreply@example.com
```

Production rejects placeholder or short JWT secrets, wildcard CORS, insecure
remote web origins, missing SMTP delivery, malformed database/Redis URLs, and
invalid numeric limits. A loopback HTTP CORS origin remains permitted for the
packaged desktop renderer when it is explicitly listed.

Do not log the environment or print connection URLs. Store database, JWT,
Redis, SMTP, Trakt, Real-Debrid, and Sentry credentials in the deployment
platform's secret manager.

## Single Versus Multiple Instances

`SERVER_INSTANCE_MODE=single` permits the built-in bounded in-memory rate-limit
store when `REDIS_URL` is absent. It is appropriate only when all traffic is
routed to one API process. Cross-device presence/session features that use
Redis remain limited when Redis is absent. `RATE_LIMIT_GLOBAL_MAX` defaults to
1000 requests per 15 minutes per hashed client address; auth and catalog routes
also apply their narrower limits.

`SERVER_INSTANCE_MODE=multi` requires `REDIS_URL` during configuration and a
working Redis connection during startup. Rate limiting fails closed with a
typed `503` if Redis becomes unavailable; it never silently applies separate
per-process limits. Use a managed Redis service with authentication and TLS
(`rediss://`) when traffic crosses an untrusted network.

When Redis is explicitly configured in single mode but unavailable, the server
may start for diagnostics, but `/ready` and `/health` remain unhealthy and rate
limiting uses the bounded single-process fallback.

## Reverse Proxy And Client Addresses

Terminate public TLS at a maintained reverse proxy or load balancer and forward
traffic to the API over a trusted network. Configure:

- `CORS_ORIGINS` as a comma-separated allowlist of exact origins.
- `TRUST_PROXY_HOPS=0` when clients connect directly.
- `TRUST_PROXY_HOPS=1` for one trusted edge proxy, or the exact number of
  trusted hops in a fixed chain.

The server ignores `X-Forwarded-For` when proxy trust is zero. The edge must
overwrite untrusted forwarded headers instead of appending to arbitrary client
input. Rate-limit identifiers are hashed before storage and are not logged.

## Health Probes

Use different probes for different decisions:

| Endpoint      | Meaning                                      | Dependencies                             |
| ------------- | -------------------------------------------- | ---------------------------------------- |
| `GET /live`   | The Node process can answer HTTP             | None                                     |
| `GET /ready`  | The instance can receive application traffic | PostgreSQL and configured/required Redis |
| `GET /health` | Backward-compatible readiness alias          | Same as `/ready`                         |

Readiness returns `503` during graceful shutdown, when PostgreSQL is down, or
when configured/required Redis is unavailable. Responses expose only safe
states, instance mode, rate-limit store type, email mode, proxy-hop count, and
build metadata. They do not expose connection URLs or credentials.

Docker uses `/live` for container liveness. Load balancers and orchestrators
should use `/ready` before routing traffic.

The same production packaging boundary used by CI can be checked locally with:

```bash
bash scripts/smoke-server-container.sh
```

This builds the production image, starts an isolated PostgreSQL dependency,
verifies `/live` and `/ready`, confirms the non-root runtime user, and exercises
graceful container shutdown.

## Database And Startup

Run schema migrations as a separate deployment step before starting new API
instances:

```bash
npx prisma migrate deploy --schema=server/prisma/schema.prisma
```

The process verifies PostgreSQL and, in multi-instance mode, Redis before it
opens the listener. Do not run destructive development schema commands in a
production release.

## Email Delivery

Development can use `EMAIL_DELIVERY_MODE=log`; messages are redacted and not
sent. Production requires `smtp` because registration verification and password
recovery otherwise appear successful without reaching the user. SMTP startup
configuration is validated as a complete set. Delivery-provider outages remain
request-level errors and should be monitored through structured logs/Sentry.

## Graceful Shutdown

On `SIGTERM` or `SIGINT`, the server:

1. marks readiness unhealthy;
2. stops bridge supervision and background sync;
3. stops accepting HTTP connections and drains active requests;
4. force-closes remaining connections after `SHUTDOWN_TIMEOUT_MS` (default 10
   seconds);
5. disconnects Redis and PostgreSQL and flushes Sentry.

Set the orchestrator termination grace period above `SHUTDOWN_TIMEOUT_MS`.
Deployments should stop routing to `/ready` before sending the termination
signal.
