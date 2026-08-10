import {
  bridgeOperationalMetricsV1Schema,
  type BridgeJobState,
  type BridgeOperationalCounterName,
  type BridgeOperationalMetricsCounters,
  type BridgeOperationalMetricsV1,
} from "@streamer/shared";

const terminalCounterByState = {
  no_peers: "terminal_no_peers",
  stalled: "terminal_stalled",
  error: "terminal_error",
  cancelled: "terminal_cancelled",
  expired: "terminal_expired",
} as const satisfies Partial<
  Record<BridgeJobState, BridgeOperationalCounterName>
>;

const MAX_OBSERVED_TERMINAL_JOBS = 4_096;

function createEmptyCounters(): BridgeOperationalMetricsCounters {
  return {
    rate_limited: 0,
    session_issued: 0,
    session_renewed: 0,
    session_revoked: 0,
    idempotency_conflict: 0,
    terminal_no_peers: 0,
    terminal_stalled: 0,
    terminal_error: 0,
    terminal_cancelled: 0,
    terminal_expired: 0,
  };
}

const counters = createEmptyCounters();
const observedTerminalJobs = new Map<string, BridgeJobState>();

export function recordBridgeOperationalEvent(
  counter: BridgeOperationalCounterName,
) {
  counters[counter] += 1;
}

/**
 * Record each terminal observation once per process-local job identity. Job
 * ids never leave this bounded map or appear in the exported snapshot.
 */
export function recordBridgeTerminalState(
  jobId: string,
  state: BridgeJobState,
) {
  const counter =
    terminalCounterByState[state as keyof typeof terminalCounterByState];
  if (!counter || observedTerminalJobs.has(jobId)) return;

  while (observedTerminalJobs.size >= MAX_OBSERVED_TERMINAL_JOBS) {
    const oldest = observedTerminalJobs.keys().next().value;
    if (!oldest) break;
    observedTerminalJobs.delete(oldest);
  }

  observedTerminalJobs.set(jobId, state);
  counters[counter] += 1;
}

export function getBridgeOperationalMetricsSnapshot(
  now = Date.now(),
): BridgeOperationalMetricsV1 {
  return bridgeOperationalMetricsV1Schema.parse({
    protocolVersion: 1,
    sampledAt: new Date(now).toISOString(),
    counters: { ...counters },
  });
}

export function __resetBridgeOperationalMetricsForTests() {
  Object.assign(counters, createEmptyCounters());
  observedTerminalJobs.clear();
}
