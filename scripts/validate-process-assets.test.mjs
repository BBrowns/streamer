import assert from "node:assert/strict";
import test from "node:test";

import {
  validateHooks,
  validateProcessAssets,
} from "./validate-process-assets.mjs";

test("project process assets have valid metadata and portable hooks", () => {
  assert.deepEqual(validateProcessAssets(), []);
});

test("rejects a valid JSON hook file that disables required controls", () => {
  const errors = validateHooks({ hooks: {} });
  assert.ok(
    errors.some((error) =>
      error.includes("missing SessionStart/startup|resume"),
    ),
  );
  assert.ok(errors.some((error) => error.includes("missing PreToolUse/Bash")));
});
