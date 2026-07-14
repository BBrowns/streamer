"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  inspectNodeBinary,
  isExpectedNodeRuntime,
} = require("../scripts/vendor-node");

test("reuses only the expected vendored Node version and architecture", () => {
  assert.equal(
    isExpectedNodeRuntime(
      { version: "24.18.0", arch: "arm64" },
      "24.18.0",
      "arm64",
    ),
    true,
  );
  assert.equal(
    isExpectedNodeRuntime(
      { version: "24.2.0", arch: "arm64" },
      "24.18.0",
      "arm64",
    ),
    false,
  );
  assert.equal(
    isExpectedNodeRuntime(
      { version: "24.18.0", arch: "x64" },
      "24.18.0",
      "arm64",
    ),
    false,
  );
});

test("reads version and architecture from a Node binary", () => {
  const execute = (binaryPath, args, options) => {
    assert.equal(binaryPath, "/vendor/bin/node");
    assert.deepEqual(args, [
      "-p",
      "JSON.stringify({ version: process.versions.node, arch: process.arch })",
    ]);
    assert.deepEqual(options, { encoding: "utf8" });
    return '{"version":"24.18.0","arch":"arm64"}\n';
  };

  assert.deepEqual(inspectNodeBinary("/vendor/bin/node", execute), {
    version: "24.18.0",
    arch: "arm64",
  });
});

test("treats an unreadable Node binary as unavailable", () => {
  assert.equal(
    inspectNodeBinary("/vendor/bin/node", () => {
      throw new Error("not executable");
    }),
    null,
  );
});
