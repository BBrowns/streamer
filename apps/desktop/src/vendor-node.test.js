"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  getExpectedChecksum,
  inspectVendoredNodeRuntime,
  isExpectedNodeRuntime,
  parseMachOArchitecture,
  parseNodeVersionHeader,
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

test("reads a Node version from the bundled release header", () => {
  assert.equal(
    parseNodeVersionHeader(`#define NODE_MAJOR_VERSION 24
#define NODE_MINOR_VERSION 18
#define NODE_PATCH_VERSION 0
`),
    "24.18.0",
  );
  assert.equal(parseNodeVersionHeader("#define NODE_MAJOR_VERSION 24"), null);
});

test("reads arm64 and x64 from thin 64-bit Mach-O headers", () => {
  const header = (cpuType) => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(0xfeedfacf, 0);
    buffer.writeInt32LE(cpuType, 4);
    return buffer;
  };

  assert.equal(parseMachOArchitecture(header(0x0100000c)), "arm64");
  assert.equal(parseMachOArchitecture(header(0x01000007)), "x64");
  assert.equal(parseMachOArchitecture(Buffer.alloc(8)), null);
});

test("inspects a foreign-platform vendored runtime without executing it", () => {
  const runtimeRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "vendor-node-test-"),
  );
  try {
    fs.mkdirSync(path.join(runtimeRoot, "include/node"), { recursive: true });
    fs.mkdirSync(path.join(runtimeRoot, "bin"), { recursive: true });
    fs.writeFileSync(
      path.join(runtimeRoot, "include/node/node_version.h"),
      `#define NODE_MAJOR_VERSION 24
#define NODE_MINOR_VERSION 18
#define NODE_PATCH_VERSION 0
`,
    );
    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(0xfeedfacf, 0);
    binaryHeader.writeInt32LE(0x0100000c, 4);
    fs.writeFileSync(path.join(runtimeRoot, "bin/node"), binaryHeader);

    assert.deepEqual(inspectVendoredNodeRuntime(runtimeRoot), {
      version: "24.18.0",
      arch: "arm64",
    });
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test("treats an incomplete vendored runtime as unavailable", () => {
  assert.equal(inspectVendoredNodeRuntime("/missing/vendor/runtime"), null);
});

test("finds only exact archive checksums in the Node manifest", () => {
  const checksum = "a".repeat(64);
  const manifest = `${"b".repeat(64)}  node-v24.18.0-darwin-x64.tar.gz\n${checksum}  node-v24.18.0-darwin-arm64.tar.gz\n`;
  assert.equal(
    getExpectedChecksum(manifest, "node-v24.18.0-darwin-arm64.tar.gz"),
    checksum,
  );
  assert.equal(
    getExpectedChecksum(manifest, "node-v24.18.0-darwin-arm.tar.gz"),
    null,
  );
});
