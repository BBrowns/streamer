import assert from "node:assert/strict";
import test from "node:test";

import { findUnpinnedActions } from "./check-github-actions.mjs";

test("all repository workflow actions use full commit SHAs", () => {
  assert.deepEqual(findUnpinnedActions(), []);
});
