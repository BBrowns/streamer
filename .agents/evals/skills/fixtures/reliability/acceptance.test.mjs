import assert from "node:assert/strict";
import test from "node:test";

import { runWithRetries } from "./src/retry.mjs";

test("retries until the first success within the bound", async () => {
  const attempts = [];
  const result = await runWithRetries(
    async (attempt) => {
      attempts.push(attempt);
      if (attempt < 3) throw new Error("transient");
      return "ready";
    },
    { maxAttempts: 3 },
  );
  assert.equal(result, "ready");
  assert.deepEqual(attempts, [1, 2, 3]);
});

test("does not exceed maxAttempts", async () => {
  let attempts = 0;
  await assert.rejects(
    runWithRetries(
      async () => {
        attempts += 1;
        throw new Error("still failing");
      },
      { maxAttempts: 2 },
    ),
    /still failing/,
  );
  assert.equal(attempts, 2);
});

test("an already-aborted signal prevents the first attempt", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    runWithRetries(
      async () => {
        called = true;
      },
      { maxAttempts: 3, signal: controller.signal },
    ),
    { name: "AbortError" },
  );
  assert.equal(called, false);
});
