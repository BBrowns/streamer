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
  const project = xcode.project("unused.pbxproj");

  project.hash = { project: { objects: {} } };

  assert.equal(uuidPackage.version, "11.1.1");
  assert.match(project.generateUuid(), /^[0-9A-F]{24}$/);
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

  assert.equal(metroConfig.version, "0.86.2");
  assert.ok(metroNodes.length > 0);
  assert.deepEqual(
    [...new Set(metroNodes.map(([, packageInfo]) => packageInfo.version))],
    ["0.84.5"],
  );
  assert.deepEqual(imageSizeNodes, []);
});

test("NativeWind resolves a Tailwind 3-compatible mobile toolchain", () => {
  const lockfile = readLockfile();
  const mobilePackage = lockfile.packages["apps/mobile"];
  const tailwindPackage =
    lockfile.packages["apps/mobile/node_modules/tailwindcss"];
  const cssInteropPackage =
    lockfile.packages["node_modules/react-native-css-interop"];

  assert.equal(mobilePackage.dependencies.tailwindcss, "3.4.19");
  assert.equal(tailwindPackage.version.split(".")[0], "3");
  assert.equal(cssInteropPackage.peerDependencies.tailwindcss, "~3");
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
