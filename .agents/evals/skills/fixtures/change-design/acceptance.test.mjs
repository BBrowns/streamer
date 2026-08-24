import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("decision record covers every durable design obligation", () => {
  const decision = readFileSync("DECISION.md", "utf8");
  for (const heading of [
    "## Ownership",
    "## State lifecycle",
    "## Data flow",
    "## Failure modes",
    "## Compatibility",
    "## Verification",
  ]) {
    assert.ok(decision.includes(heading), `missing ${heading}`);
  }
});
