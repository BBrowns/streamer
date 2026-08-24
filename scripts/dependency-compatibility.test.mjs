import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("Expo SDK 57 resolves one compatible Gesture Handler native module", () => {
  const rootPackage = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const mobilePackage = JSON.parse(
    readFileSync(
      new URL("../apps/mobile/package.json", import.meta.url),
      "utf8",
    ),
  );
  const lockfile = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  );

  assert.equal(
    mobilePackage.dependencies["react-native-gesture-handler"],
    "~2.32.0",
  );
  assert.equal(rootPackage.overrides["react-native-gesture-handler"], "2.32.0");
  assert.equal(
    lockfile.packages["node_modules/react-native-gesture-handler"].version,
    "2.32.0",
  );
  assert.equal(
    lockfile.packages["apps/mobile/node_modules/react-native-gesture-handler"],
    undefined,
  );
});
