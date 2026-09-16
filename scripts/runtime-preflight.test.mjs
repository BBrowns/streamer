import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs, runRuntimePreflight } from "./runtime-preflight.mjs";

function commandRunner(command, args) {
  if (command === "which") {
    return { status: 0, stdout: `/usr/local/bin/${args[0]}\n` };
  }
  if (command === "file") {
    return { status: 0, stdout: "Mach-O 64-bit executable arm64\n" };
  }
  if (command === "npm") return { status: 0, stdout: "12.0.2\n" };
  if (command === "ffmpeg" || command === "ffprobe") {
    return { status: 0, stdout: `${command} version 7.0.0\n` };
  }
  return { status: 1, stdout: "" };
}

const healthyFetch = async () => ({ ok: true, status: 200 });

test("parses explicit preflight surface and output options", () => {
  assert.deepEqual(
    parseArgs([
      "--surface",
      "server",
      "--output",
      "tmp/preflight.json",
      "--json",
    ]),
    {
      json: true,
      surface: "server",
      output: "tmp/preflight.json",
      apiUrl: null,
      bridgeUrl: null,
      databaseUrl: null,
    },
  );
});

test("passes when toolchain, local services, and bridge are reachable", async () => {
  const result = await runRuntimePreflight({
    arch: "arm64",
    commandRunner,
    fetchImpl: healthyFetch,
    tcpProbe: () => true,
    env: { DATABASE_URL: "postgresql://user:secret@127.0.0.1:5432/db" },
  });

  assert.equal(result.status, "passed");
  assert.deepEqual(
    result.checks.map(({ id, status }) => ({ id, status })),
    [
      { id: "toolchain", status: "passed" },
      { id: "api", status: "passed" },
      { id: "database", status: "passed" },
      { id: "bridge", status: "passed" },
    ],
  );
  assert.doesNotMatch(JSON.stringify(result), /secret|postgresql:\/\//i);
});

test("blocks playback when the native media runtime uses another architecture", async () => {
  const result = await runRuntimePreflight({
    arch: "arm64",
    commandRunner: (command, args) => {
      if (command === "file")
        return { status: 0, stdout: "Mach-O x86_64 executable\n" };
      return commandRunner(command, args);
    },
    fetchImpl: healthyFetch,
    tcpProbe: () => true,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.checks[0].failureCode, "NATIVE_ARCHITECTURE_MISMATCH");
});

test("blocks playback when the bridge is not reachable", async () => {
  const result = await runRuntimePreflight({
    arch: "arm64",
    commandRunner,
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
    tcpProbe: () => true,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.checks.at(-1).id, "bridge");
  assert.equal(result.checks.at(-1).failureCode, "BRIDGE_UNREACHABLE");
});

test("does not require the media runtime for a UI-only preflight", async () => {
  const result = await runRuntimePreflight({
    surface: "ui",
    arch: "arm64",
    commandRunner: (command, args) => {
      if (command === "npm") return { status: 0, stdout: "12.0.2\n" };
      return { status: 1, stdout: "" };
    },
  });

  assert.equal(result.status, "passed");
  assert.deepEqual(result.checks.map(({ id }) => id), ["toolchain"]);
});
