import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("Expo xcode tooling resolves the patched CommonJS UUID API", () => {
  const xcode = require("xcode");
  const uuidPackage = require("uuid/package.json");
  const project = xcode.project("unused.pbxproj");

  project.hash = { project: { objects: {} } };

  assert.equal(uuidPackage.version, "11.1.1");
  assert.match(project.generateUuid(), /^[0-9A-F]{24}$/);
});
