"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  resolveBridgeEntrypointPath,
  resolveBridgeWorkingDirectoryPath,
  resolveNodeBinaryCandidatePaths,
  resolveNodeDataChannelBinaryPath,
} = require("./bridge-runtime");

const dirname = path.join(path.sep, "repo", "apps", "desktop", "dist");
const resourcesPath = path.join(
  path.sep,
  "Streamer.app",
  "Contents",
  "Resources",
);

function existsFactory(paths) {
  const normalized = new Set(paths.map((item) => path.normalize(item)));
  return (candidate) => normalized.has(path.normalize(candidate));
}

test("prefers packaged stream-server entrypoint when present", () => {
  const packagedEntrypoint = path.join(
    resourcesPath,
    "stream-server",
    "index.js",
  );
  const devEntrypoint = path.join(
    path.sep,
    "repo",
    "packages",
    "stream-server",
    "dist",
    "index.js",
  );

  assert.equal(
    resolveBridgeEntrypointPath({
      dirname,
      resourcesPath,
      exists: existsFactory([packagedEntrypoint, devEntrypoint]),
    }),
    packagedEntrypoint,
  );
});

test("falls back to development stream-server entrypoint outside packaged apps", () => {
  const devEntrypoint = path.join(
    path.sep,
    "repo",
    "packages",
    "stream-server",
    "dist",
    "index.js",
  );

  assert.equal(
    resolveBridgeEntrypointPath({
      dirname,
      resourcesPath: null,
      exists: existsFactory([devEntrypoint]),
    }),
    devEntrypoint,
  );
});

test("prefers packaged node runtimes over system or environment nodes", () => {
  const candidates = resolveNodeBinaryCandidatePaths({
    dirname,
    env: {
      STREAMER_BRIDGE_NODE: "/usr/local/bin/node",
      PATH: "/usr/local/bin",
    },
    homeDir: "/Users/streamer",
    isPackaged: true,
    platform: "darwin",
    resourcesPath,
  });

  assert.deepEqual(candidates.slice(0, 2), [
    path.join(resourcesPath, "node", "darwin-arm64", "bin", "node"),
    path.join(resourcesPath, "node", "darwin-x64", "bin", "node"),
  ]);
  assert.equal(candidates.includes("/usr/local/bin/node"), false);
});

test("allows explicit system node override in packaged app only when opted in", () => {
  const candidates = resolveNodeBinaryCandidatePaths({
    dirname,
    env: {
      STREAMER_BRIDGE_ALLOW_SYSTEM_NODE: "1",
      STREAMER_BRIDGE_NODE: "/usr/local/bin/node",
      PATH: "/usr/local/bin",
    },
    homeDir: "/Users/streamer",
    isPackaged: true,
    platform: "darwin",
    resourcesPath,
  });

  assert.equal(candidates.includes("/usr/local/bin/node"), true);
});

test("uses packaged node-datachannel binary before workspace binary", () => {
  const packagedNative = path.join(
    resourcesPath,
    "node_modules",
    "node-datachannel",
    "build",
    "Release",
    "node_datachannel.node",
  );
  const workspaceNative = path.join(
    path.sep,
    "repo",
    "node_modules",
    "node-datachannel",
    "build",
    "Release",
    "node_datachannel.node",
  );

  assert.equal(
    resolveNodeDataChannelBinaryPath({
      dirname,
      resourcesPath,
      exists: existsFactory([packagedNative, workspaceNative]),
    }),
    packagedNative,
  );
});

test("uses resources directory as packaged bridge working directory", () => {
  assert.equal(
    resolveBridgeWorkingDirectoryPath({
      dirname,
      resourcesPath,
      entrypoint: path.join(resourcesPath, "stream-server", "index.js"),
    }),
    resourcesPath,
  );
});
