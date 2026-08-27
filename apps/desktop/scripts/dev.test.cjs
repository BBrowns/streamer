"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assertBridgePortAvailable, waitForRenderer } = require("./dev.cjs");

test("waits for an HTML renderer instead of assuming the port is ready", async () => {
  let attempts = 0;
  let clock = 0;

  await assert.doesNotReject(
    waitForRenderer({
      timeoutMs: 100,
      retryMs: 10,
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      probe: async () => {
        attempts += 1;
        return attempts === 3;
      },
    }),
  );
  assert.equal(attempts, 3);
});

test("reports a renderer startup failure with the supported recovery command", async () => {
  await assert.rejects(
    waitForRenderer({
      timeoutMs: 20,
      retryMs: 10,
      now: (() => {
        let clock = 0;
        return () => clock++ * 10;
      })(),
      sleep: async () => undefined,
      probe: async () => false,
    }),
    /npm run dev:mobile:web.*npm run dev:desktop-all/s,
  );
});

test("refuses to launch desktop when another process owns the bridge port", async () => {
  await assert.rejects(
    assertBridgePortAvailable({ probe: async () => true }),
    /bridge port 11470.*already in use/i,
  );
});

test("allows desktop startup when its bridge port is free", async () => {
  await assert.doesNotReject(
    assertBridgePortAvailable({ probe: async () => false }),
  );
});
