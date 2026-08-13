#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");

const PINNED_NPM_VERSION = "12.0.2";

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(
      `EAS npm bootstrap failed while running ${command} ${args.join(" ")}`,
    );
  }
  return String(result.stdout || "").trim();
}

if (require.main === module) {
  run("npm", ["install", "--global", `npm@${PINNED_NPM_VERSION}`]);
  const actualVersion = run("npm", ["--version"]);
  if (actualVersion !== PINNED_NPM_VERSION) {
    throw new Error(
      `EAS provided npm ${actualVersion || "unknown"}; expected ${PINNED_NPM_VERSION}`,
    );
  }
  console.log(`EAS build is using npm ${actualVersion}.`);
}

module.exports = { PINNED_NPM_VERSION, run };
