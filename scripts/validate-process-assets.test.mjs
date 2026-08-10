import assert from "node:assert/strict";
import test from "node:test";

import { validateProcessAssets } from "./validate-process-assets.mjs";

test("project process assets have valid metadata and portable hooks", () => {
  assert.deepEqual(validateProcessAssets(), []);
});
