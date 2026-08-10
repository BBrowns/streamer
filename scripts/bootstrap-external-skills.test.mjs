import assert from "node:assert/strict";
import test from "node:test";

import { destinationFor, validateEntry } from "./bootstrap-external-skills.mjs";

const validEntry = {
  name: "frontend-design",
  repository: "anthropics/skills",
  path: "skills/frontend-design",
  ref: "f17010c9bb483898c1d9c9f42dde2b3a98889434",
};

test("accepts a pinned, relative external skill entry", () => {
  assert.deepEqual(validateEntry(validEntry), validEntry);
  assert.match(
    destinationFor(validEntry),
    /\.agents[\\/]skills[\\/]frontend-design$/,
  );
});

test("rejects lock entries that can escape the skill root", () => {
  assert.throws(
    () => validateEntry({ ...validEntry, name: "../outside" }),
    /Invalid external skill name/,
  );
  assert.throws(
    () => validateEntry({ ...validEntry, path: "../outside" }),
    /Invalid external skill path/,
  );
  assert.throws(
    () => validateEntry({ ...validEntry, ref: "main" }),
    /full commit SHA/,
  );
});

test("rejects repositories outside the fixed GitHub owner/repository shape", () => {
  assert.throws(
    () =>
      validateEntry({ ...validEntry, repository: "https://example.com/evil" }),
    /Invalid external skill repository/,
  );
});
