import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readLockfile() {
  return JSON.parse(
    readFileSync(resolve(repoRoot, "package-lock.json"), "utf8"),
  );
}

test("Expo xcode tooling resolves the patched CommonJS UUID API", () => {
  const xcode = require("xcode");
  const uuidPackage = require("uuid/package.json");
  const xcodeUuidPackage = require("xcode/node_modules/uuid/package.json");
  const project = xcode.project("unused.pbxproj");

  project.hash = { project: { objects: {} } };

  assert.equal(uuidPackage.version, "14.0.2");
  assert.equal(xcodeUuidPackage.version, "11.1.1");
  assert.match(project.generateUuid(), /^[0-9A-F]{24}$/);
});

test("Detox remains loadable with the workspace glob override", () => {
  const detox = require("detox");

  assert.ok(detox);
});

test("React Native resolves the supported Metro line without image-size", () => {
  const lockfile = readLockfile();
  const metroConfig =
    lockfile.packages["node_modules/@react-native/metro-config"];
  const metroNodes = Object.entries(lockfile.packages).filter(
    ([path]) =>
      path === "node_modules/metro" || path.endsWith("/node_modules/metro"),
  );
  const imageSizeNodes = Object.keys(lockfile.packages).filter(
    (path) =>
      path === "node_modules/image-size" ||
      path.endsWith("/node_modules/image-size"),
  );

  assert.equal(metroConfig.version, "0.86.3");
  assert.ok(metroNodes.length > 0);
  assert.deepEqual(
    [...new Set(metroNodes.map(([, packageInfo]) => packageInfo.version))],
    ["0.84.5"],
  );
  assert.deepEqual(imageSizeNodes, []);
});

test("Expo 57 native modules stay on a compatible Worklets contract", () => {
  const lockfile = readLockfile();
  const expoModulesCore = lockfile.packages["node_modules/expo-modules-core"];
  const reanimated = lockfile.packages["node_modules/react-native-reanimated"];
  const worklets = lockfile.packages["node_modules/react-native-worklets"];
  const safeArea =
    lockfile.packages["node_modules/react-native-safe-area-context"];

  assert.equal(expoModulesCore.version, "57.0.14");
  assert.equal(reanimated.version, "4.5.5");
  assert.equal(worklets.version, "0.10.4");
  assert.equal(safeArea.version, "5.9.1");
  assert.equal(
    expoModulesCore.peerDependencies["react-native-worklets"],
    "^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0",
  );
  assert.match(reanimated.peerDependencies["react-native-worklets"], /0\.10\.x/);
});

test("NativeWind resolves a Tailwind 3-compatible mobile toolchain", () => {
  const lockfile = readLockfile();
  const mobilePackage = lockfile.packages["apps/mobile"];
  const tailwindPackage = lockfile.packages["node_modules/tailwindcss"];
  const cssInteropPackage =
    lockfile.packages["node_modules/react-native-css-interop"];

  assert.equal(mobilePackage.dependencies.tailwindcss, "3.4.19");
  assert.equal(lockfile.packages[""].devDependencies.tailwindcss, "3.4.19");
  assert.equal(tailwindPackage.version.split(".")[0], "3");
  assert.equal(cssInteropPackage.peerDependencies.tailwindcss, "~3");
});

test("Hono WebSocket tooling keeps its compatible peer beside the server adapter", () => {
  const lockfile = readLockfile();
  const rootPackage = lockfile.packages[""];
  const websocketPackage = lockfile.packages["node_modules/@hono/node-ws"];
  const rootNodeServer =
    lockfile.packages["node_modules/@hono/node-server"];
  const serverNodeServer =
    lockfile.packages["server/node_modules/@hono/node-server"];

  assert.equal(
    rootPackage.peerDependencies["@hono/node-server"],
    "1.19.17",
  );
  assert.equal(rootNodeServer.version, "1.19.17");
  assert.equal(rootNodeServer.peer, true);
  assert.equal(
    websocketPackage.peerDependencies["@hono/node-server"],
    "^1.19.11",
  );
  assert.equal(serverNodeServer.version, "2.1.1");
});

test("unused native adapters resolve without vulnerable parser packages", () => {
  const lockfile = readLockfile();
  const browserAdapter = lockfile.packages["node_modules/@vibrant/image-node"];
  const ipAdapter =
    lockfile.packages["node_modules/bittorrent-tracker/node_modules/ip"];
  const ipNodes = Object.entries(lockfile.packages).filter(
    ([path]) => path === "node_modules/ip" || path.endsWith("/node_modules/ip"),
  );
  const unresolvedIpNodes = ipNodes.filter(
    ([, packageInfo]) => (packageInfo.name ?? "ip") === "ip",
  );
  const fileTypeNodes = Object.keys(lockfile.packages).filter(
    (path) =>
      path === "node_modules/file-type" ||
      path.endsWith("/node_modules/file-type"),
  );

  assert.equal(browserAdapter.name, "@vibrant/image-browser");
  assert.equal(browserAdapter.version, "4.0.4");
  assert.deepEqual(fileTypeNodes, []);
  assert.deepEqual(unresolvedIpNodes, []);
  assert.ok(ipNodes.length > 0);
  assert.ok(
    ipNodes.every(
      ([, packageInfo]) =>
        packageInfo.name === "ip-address" && packageInfo.version === "10.5.0",
    ),
  );
  assert.equal(ipAdapter.name, "ip-address");
  assert.equal(ipAdapter.version, "10.5.0");
});

test("registry lock entries retain immutable tarball and integrity pins", () => {
  const lockfile = readLockfile();
  const unpinned = Object.entries(lockfile.packages)
    .filter(
      ([path, packageInfo]) =>
        path.includes("node_modules/") &&
        packageInfo?.version &&
        !packageInfo.link &&
        (!packageInfo.resolved || !packageInfo.integrity),
    )
    .map(([path, packageInfo]) => `${path}@${packageInfo.version}`);

  assert.deepEqual(unpinned, []);
});
