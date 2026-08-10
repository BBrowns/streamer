import { beforeEach, describe, expect, it } from "vitest";
import { bridgeOperationalMetricsV1Schema } from "@streamer/shared";
import {
  __resetBridgeOperationalMetricsForTests,
  getBridgeOperationalMetricsSnapshot,
  recordBridgeOperationalEvent,
  recordBridgeTerminalState,
} from "../bridge-metrics.js";

describe("bridge operational metrics", () => {
  beforeEach(() => {
    __resetBridgeOperationalMetricsForTests();
  });

  it("exposes only bounded low-cardinality counters", () => {
    recordBridgeOperationalEvent("rate_limited");
    recordBridgeOperationalEvent("session_issued");
    recordBridgeOperationalEvent("session_revoked");
    recordBridgeOperationalEvent("idempotency_conflict");
    recordBridgeTerminalState("job-1", "no_peers");
    recordBridgeTerminalState("job-1", "no_peers");
    recordBridgeTerminalState("job-2", "stalled");

    const snapshot = getBridgeOperationalMetricsSnapshot(
      Date.parse("2030-01-01T00:00:00.000Z"),
    );

    expect(bridgeOperationalMetricsV1Schema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot).toEqual({
      protocolVersion: 1,
      sampledAt: "2030-01-01T00:00:00.000Z",
      counters: {
        rate_limited: 1,
        session_issued: 1,
        session_renewed: 0,
        session_revoked: 1,
        idempotency_conflict: 1,
        terminal_no_peers: 1,
        terminal_stalled: 1,
        terminal_error: 0,
        terminal_cancelled: 0,
        terminal_expired: 0,
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain("job-1");
  });
});
