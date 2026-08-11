import assert from "node:assert/strict";
import test from "node:test";
import { evaluateArchitectureBudget } from "./check-architecture-budgets.mjs";

test("rejects a new oversized module without an owner and exit condition", () => {
  const result = evaluateArchitectureBudget({
    files: [{ relativePath: "server/src/modules/new/module.ts", lines: 901 }],
    defaultMaxLines: 900,
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /bounded decomposition/);
});

test("accepts a reviewed temporary exception before its deadline", () => {
  const result = evaluateArchitectureBudget({
    files: [
      {
        relativePath: "server/src/modules/aggregator/aggregator.service.ts",
        lines: 2131,
      },
    ],
    defaultMaxLines: 900,
    exceptions: {
      "server/src/modules/aggregator/aggregator.service.ts": {
        maxLines: 2300,
        owner: "server platform maintainers",
        reviewBy: "2026-09-30",
        reason: "Existing boundary",
        nextAction: "Extract bounded responsibilities",
      },
    },
    now: new Date("2026-08-11T00:00:00.000Z"),
  });

  assert.deepEqual(result.failures, []);
  assert.equal(result.exceptionsUsed.length, 1);
});

test("rejects an expired architecture exception", () => {
  const result = evaluateArchitectureBudget({
    files: [{ relativePath: "server/src/modules/legacy.ts", lines: 901 }],
    defaultMaxLines: 900,
    exceptions: {
      "server/src/modules/legacy.ts": {
        maxLines: 1000,
        owner: "platform",
        reviewBy: "2026-08-10",
        reason: "Temporary",
        nextAction: "Split",
      },
    },
    now: new Date("2026-08-11T00:00:00.000Z"),
  });

  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /expired/);
});
