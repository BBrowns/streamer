# ADR-0007: Keep Authentication And Sync Failures Separate

- Status: Accepted
- Date: 2026-09-01
- Owner: Streamer client platform
- Supersedes: none
- Superseded by: none

## Context

The browser reported repeated WebSocket close code `1006` events before the
client logged out after a refresh failure. WebSocket `1006` only identifies an
abnormal transport or handshake end; it does not prove that credentials are
invalid. The client also treated every refresh rejection as a logout, including
network, timeout, rate-limit, service-unavailable, and token-storage errors.

Refresh tokens are single-use and rotated atomically on the server. A request
that receives no response is therefore ambiguous: the server may already have
consumed the old token. Repeating it automatically could trigger replay
protection and revoke the session family.

## Decision

`refreshAuthSession()` classifies refresh outcomes at the API boundary. Only an
explicit invalid, expired, revoked, or replayed refresh response invalidates the
auth session. Other failures preserve the authenticated shell and update
non-persisted session health with a bounded retry cooldown where applicable.

`SyncClient` owns WebSocket reconnects and exposes a read-only status snapshot.
Close code `1006` is treated as a transport or handshake failure, and `1008` is
not treated as standalone proof of invalid credentials. Reconnects use one
bounded, jittered retry policy and pause while the app is inactive or hidden.

The existing refresh-token rotation, WebSocket subprotocol, native headers,
bridge boundary, and IPC contracts remain unchanged.

## Options Considered

1. Log out on every refresh or WebSocket failure. Rejected because transient
   failures become destructive user-visible auth loss.
2. Remove refresh-token rotation or blindly retry an unanswered refresh.
   Rejected because it weakens or can trigger replay protection.
3. Use typed client-side failure classification and a degraded sync/session
   state. Selected because it fixes the observed false logout without changing
   the wire contract.

## Consequences

- Temporary network, service, rate-limit, and storage failures remain visible
  without destroying the user session.
- Browser diagnostics remain inherently limited; server-side request and sync
  logs are required to distinguish failed handshakes from transport loss.
- A refresh with an unknown outcome may still require reauthentication once the
  current access token expires; seamless reconciliation is intentionally not
  invented without a separate auth-contract design.
- Client logs contain only bounded categories, status codes, retry timing, and
  close metadata. Tokens, credentials, URLs, magnets, hashes, and media data
  are excluded.

## Migration And Rollback

The change is additive to the in-memory auth state and SyncClient status API.
Existing callers continue to use `refreshAuthSession()` and `useSync()`; the
new status and retry fields are opt-in to presentation. Rollback can restore
the previous client behavior, but doing so reintroduces false logout and
unbounded diagnostic noise. No data migration is required.

## Revisit Triggers

- Evidence that background sync is a hard product requirement.
- Measured refresh replay or lost-response cases requiring safe outcome
  reconciliation.
- A server contract that introduces typed WebSocket auth close semantics.
- Sustained sync degradation requiring an aggregate SLO or alert beyond the
  current bounded development diagnostics.
