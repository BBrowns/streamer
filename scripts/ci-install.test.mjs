import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstallCommands,
  readPinnedNpmVersion,
  runCiInstall,
} from "./ci-install.mjs";

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
