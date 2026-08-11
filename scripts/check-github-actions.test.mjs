import assert from "node:assert/strict";
import test from "node:test";

import {
  findMissingMergeQueueTriggers,
  findUnpinnedActions,
} from "./check-github-actions.mjs";

test("all repository workflow actions use full commit SHAs", () => {
  assert.deepEqual(findUnpinnedActions(), []);
});

test("required workflows run for merge-queue checks", () => {
  assert.deepEqual(findMissingMergeQueueTriggers(), []);
});
