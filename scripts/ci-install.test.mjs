import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildInstallCommands,
  readPinnedNpmVersion,
  runCiInstall,
} from "./ci-install.mjs";

const rootPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const lockfile = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

test("reads the pinned npm version from package metadata", () => {
  assert.equal(
    readPinnedNpmVersion({ packageManager: "npm@12.0.2" }),
    "12.0.2",
  );
});

test("installs with scripts disabled and rebuilds only the approved native addon", () => {
  const commands = buildInstallCommands("12.0.2");
  assert.equal(commands.length, 4);
  assert.deepEqual(commands[0].args, [
    "--yes",
    "npm@12.0.2",
    "run",
    "security:install-scripts",
  ]);
  assert.ok(commands[1].args.includes("--ignore-scripts"));
  assert.deepEqual(commands[2].args, [
    "--yes",
    "npm@12.0.2",
    "run",
    "postinstall",
  ]);
  assert.deepEqual(commands[3].args, [
    "--yes",
    "npm@12.0.2",
    "run",
    "--prefix",
    "node_modules/node-datachannel",
    "rebuild",
    "--foreground-scripts",
  ]);
});

test("locks cmake-js for node-datachannel's no-prebuilt rebuild fallback", () => {
  assert.equal(rootPackage.devDependencies["cmake-js"], "8.0.0");
  assert.equal(lockfile.packages[""].devDependencies["cmake-js"], "8.0.0");
  assert.equal(lockfile.packages["node_modules/cmake-js"].version, "8.0.0");
  assert.equal(lockfile.packages["node_modules/cmake-js"].dev, true);
});

test("rejects a workflow npm version that diverges from package metadata", () => {
  assert.throws(
    () =>
      runCiInstall({
        env: { NPM_VERSION: "12.0.1" },
        packageJson: { packageManager: "npm@12.0.2" },
        spawn: () => ({ status: 0 }),
      }),
    /does not match packageManager/,
  );
});
