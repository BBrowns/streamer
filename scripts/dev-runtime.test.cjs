"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  detectHostArch,
  determineTargetArch,
  isSupportedNodeVersion,
  normalizeArch,
  parseNpmCommandArgs,
  resolveNpmRunner,
  selectNodeRuntime,
} = require("./dev-runtime.cjs");

test("normalizes common CPU architecture names", () => {
  assert.equal(normalizeArch("aarch64"), "arm64");
  assert.equal(normalizeArch("x86_64"), "x64");
  assert.equal(normalizeArch("mips"), null);
});

test("accepts supported Node 24 runtimes only", () => {
  assert.equal(isSupportedNodeVersion("v24.18.0"), true);
  assert.equal(isSupportedNodeVersion("v24.20.1"), true);
  assert.equal(isSupportedNodeVersion("v24.17.9"), false);
  assert.equal(isSupportedNodeVersion("v25.6.0"), false);
});

test("detects Apple Silicon even when the parent Node process is translated", () => {
  const run = (command, args) => {
    if (command === "sysctl" && args.includes("hw.optional.arm64")) {
      return { status: 0, stdout: "1\n" };
    }
    return { status: 0, stdout: "x86_64\n" };
  };

  assert.equal(
    detectHostArch({
      platform: "darwin",
      processArch: "x64",
      spawnSync: run,
    }),
    "arm64",
  );
});

test("uses the native torrent architecture when esbuild matches", () => {
  assert.equal(
    determineTargetArch({
      nodeDataChannelArch: "arm64",
      esbuildArches: ["arm64"],
      hostArch: "arm64",
      processArch: "x64",
    }),
    "arm64",
  );
});

test("rejects mixed native dependency architectures", () => {
  assert.throws(
    () =>
      determineTargetArch({
        nodeDataChannelArch: "x64",
        esbuildArches: ["arm64"],
        hostArch: "arm64",
        processArch: "x64",
      }),
    /npm run dev:repair-native/,
  );
});

test("accepts an architecture when esbuild has multiple compatible binaries", () => {
  assert.equal(
    determineTargetArch({
      nodeDataChannelArch: "x64",
      esbuildArches: ["arm64", "x64"],
      hostArch: "arm64",
      processArch: "x64",
    }),
    "x64",
  );
});

test("selects a matching supported runtime and skips Node 25", () => {
  const runtimes = new Map([
    ["system", { execPath: "system", arch: "x64", version: "v25.6.0" }],
    ["nvm", { execPath: "nvm", arch: "arm64", version: "v24.18.0" }],
  ]);
  const selected = selectNodeRuntime(["system", "nvm"], "arm64", {
    inspectRuntime: (candidate) => runtimes.get(candidate),
  });

  assert.deepEqual(selected, runtimes.get("nvm"));
});

test("fails with an actionable message when no runtime matches", () => {
  assert.throws(
    () =>
      selectNodeRuntime(["system"], "arm64", {
        inspectRuntime: () => ({
          execPath: "system",
          arch: "x64",
          version: "v25.6.0",
        }),
      }),
    /nvm install/,
  );
});

test("parses guarded npm arguments and an optional listener port", () => {
  assert.deepEqual(
    parseNpmCommandArgs([
      "--port",
      "3001",
      "--",
      "run",
      "dev",
      "--workspace=server",
    ]),
    {
      port: 3001,
      npmArgs: ["run", "dev", "--workspace=server"],
    },
  );
});

test("rejects malformed guarded npm arguments", () => {
  assert.throws(() => parseNpmCommandArgs(["run", "dev"]), /requires `--`/);
  assert.throws(
    () => parseNpmCommandArgs(["--port", "70000", "--", "run", "dev"]),
    /valid TCP port/,
  );
  assert.throws(() => parseNpmCommandArgs(["--"]), /requires npm arguments/);
});

test("uses Corepack to honor the pinned npm version when available", () => {
  const runner = resolveNpmRunner("/runtime/bin/node", {
    exists: (candidate) => candidate.endsWith("corepack/dist/corepack.js"),
  });

  assert.deepEqual(runner, {
    cli: "/runtime/lib/node_modules/corepack/dist/corepack.js",
    prefixArgs: ["npm"],
  });
});

test("falls back to the runtime npm CLI when Corepack is unavailable", () => {
  const runner = resolveNpmRunner("/runtime/bin/node", {
    env: {},
    exists: (candidate) => candidate.endsWith("npm/bin/npm-cli.js"),
  });

  assert.deepEqual(runner, {
    cli: "/runtime/lib/node_modules/npm/bin/npm-cli.js",
    prefixArgs: [],
  });
});
