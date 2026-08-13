"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const {
  detectHostArch,
  determineTargetArch,
  findProcessGroupId,
  isSupportedNodeVersion,
  normalizeArch,
  parseNpmCommandArgs,
  parseProcessGroupId,
  resolveNpmRunner,
  verifyNpmRunner,
  runForeground,
  selectNodeRuntime,
  stopListeningProcesses,
} = require("./dev-runtime.cjs");

test("normalizes common CPU architecture names", () => {
  assert.equal(normalizeArch("aarch64"), "arm64");
  assert.equal(normalizeArch("x86_64"), "x64");
  assert.equal(normalizeArch("mips"), null);
});

test("accepts supported Node 26 runtimes only", () => {
  assert.equal(isSupportedNodeVersion("v26.7.0"), true);
  assert.equal(isSupportedNodeVersion("v26.8.1"), true);
  assert.equal(isSupportedNodeVersion("v26.6.9"), false);
  assert.equal(isSupportedNodeVersion("v25.6.0"), false);
  assert.equal(isSupportedNodeVersion("v24.18.0"), false);
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

test("selects a matching supported runtime and skips unsupported majors", () => {
  const runtimes = new Map([
    ["system", { execPath: "system", arch: "x64", version: "v25.6.0" }],
    ["nvm", { execPath: "nvm", arch: "arm64", version: "v26.7.0" }],
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

test("parses process group ids from ps output", () => {
  assert.equal(parseProcessGroupId(" 94778\n"), 94778);
  assert.equal(parseProcessGroupId("not-a-pid"), null);
  assert.equal(parseProcessGroupId("0"), null);
});

test("resolves a listener process group on Unix", () => {
  const calls = [];
  const groupId = findProcessGroupId(95048, {
    platform: "darwin",
    spawnSync: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: " 94778\n" };
    },
  });

  assert.equal(groupId, 94778);
  assert.deepEqual(calls[0].args, ["-o", "pgid=", "-p", "95048"]);
});

test("terminates a stale listener's process group without touching its own group", async () => {
  const snapshots = [[95048, 95049], [95048, 95049], []];
  const groups = new Map([
    [95048, 94778],
    [95049, 12345],
  ]);
  const signals = [];

  await stopListeningProcesses(3001, {
    currentProcessGroupId: 12345,
    findListeningPids: () => snapshots.shift() || [],
    findProcessGroupId: (pid) => groups.get(pid) || null,
    kill: (target, signal) => signals.push({ target, signal }),
    sleep: async () => {},
  });

  assert.deepEqual(signals, [
    { target: -94778, signal: "SIGTERM" },
    { target: 95049, signal: "SIGTERM" },
    { target: -94778, signal: "SIGKILL" },
    { target: 95049, signal: "SIGKILL" },
  ]);
});

test("uses the selected runtime's npx to honor the pinned npm version", () => {
  const runner = resolveNpmRunner("/runtime/bin/node", {
    exists: (candidate) => candidate.endsWith("npm/bin/npx-cli.js"),
  });

  assert.deepEqual(runner, {
    cli: "/runtime/lib/node_modules/npm/bin/npx-cli.js",
    prefixArgs: ["--yes", "npm@12.0.2"],
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

test("verifies the exact npm version exposed by the selected runner", () => {
  const calls = [];
  const runner = {
    cli: "/runtime/lib/node_modules/npm/bin/npx-cli.js",
    prefixArgs: ["--yes", "npm@12.0.2"],
  };

  assert.equal(
    verifyNpmRunner("/runtime/bin/node", runner, {
      env: { NPM_CONFIG_CACHE: "/tmp/streamer-npm-cache" },
      spawnSync: (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: "12.0.2\n", stderr: "" };
      },
    }),
    "12.0.2",
  );
  assert.deepEqual(calls[0].args, [
    runner.cli,
    "--yes",
    "npm@12.0.2",
    "--version",
  ]);
});

test("can detach daemon stdin while preserving output and signal forwarding", async () => {
  const parentProcess = new EventEmitter();
  const child = new EventEmitter();
  const signals = [];
  let spawnOptions;
  child.killed = false;
  child.kill = (signal) => {
    signals.push(signal);
    child.killed = true;
  };

  const completion = runForeground("node", ["server.js"], {
    parentProcess,
    stdin: "ignore",
    spawn: (_command, _args, options) => {
      spawnOptions = options;
      return child;
    },
  });

  assert.deepEqual(spawnOptions.stdio, ["ignore", "inherit", "inherit"]);
  assert.equal(parentProcess.listenerCount("SIGINT"), 1);
  assert.equal(parentProcess.listenerCount("SIGTERM"), 1);

  parentProcess.emit("SIGINT");
  assert.deepEqual(signals, ["SIGINT"]);
  child.emit("exit", null, "SIGINT");

  assert.equal(await completion, 128);
  assert.equal(parentProcess.listenerCount("SIGINT"), 0);
  assert.equal(parentProcess.listenerCount("SIGTERM"), 0);
});

test("removes signal forwarding when foreground startup fails", async () => {
  const parentProcess = new EventEmitter();
  const child = new EventEmitter();
  child.killed = false;
  child.kill = () => {};

  const completion = runForeground("missing-node", [], {
    parentProcess,
    spawn: () => child,
  });
  const startupError = new Error("spawn failed");
  child.emit("error", startupError);

  await assert.rejects(completion, startupError);
  assert.equal(parentProcess.listenerCount("SIGINT"), 0);
  assert.equal(parentProcess.listenerCount("SIGTERM"), 0);
});
