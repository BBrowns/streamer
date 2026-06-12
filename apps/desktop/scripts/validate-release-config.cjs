const fs = require("fs");
const path = require("path");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const failures = [];

function readJson(relativePath) {
  const fullPath = path.join(desktopRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function fail(message) {
  failures.push(message);
}

function requireFile(relativePath) {
  if (!exists(relativePath)) {
    fail(`${relativePath} is missing`);
  }
}

const releaseConfig = readJson("electron-builder.release.json");
const mac = releaseConfig.mac || {};
const targets = Array.isArray(mac.target) ? mac.target : [];
const targetNames = targets.map((target) =>
  typeof target === "string" ? target : target.target,
);

if (releaseConfig.extends !== "./electron-builder.json") {
  fail("release config must extend the smoke-package config");
}
if (releaseConfig.afterSign !== "scripts/notarize.cjs") {
  fail("release config must use scripts/notarize.cjs as afterSign hook");
}
if (mac.hardenedRuntime !== true) {
  fail("mac.hardenedRuntime must be enabled for notarized distribution");
}
if (mac.gatekeeperAssess !== false) {
  fail("mac.gatekeeperAssess must be false; notarization validation happens after packaging");
}
if (!targetNames.includes("dmg")) {
  fail("release config must produce a DMG target");
}
if (!targetNames.includes("zip")) {
  fail("release config must produce a ZIP target");
}

for (const entitlementFile of [
  "apps/desktop/entitlements/entitlements.mac.plist",
  "apps/desktop/entitlements/entitlements.mac.inherit.plist",
]) {
  requireFile(entitlementFile);
  if (exists(entitlementFile)) {
    const content = read(entitlementFile);
    for (const key of [
      "com.apple.security.cs.allow-jit",
      "com.apple.security.cs.allow-unsigned-executable-memory",
      "com.apple.security.cs.disable-library-validation",
    ]) {
      if (!content.includes(key)) {
        fail(`${entitlementFile} must include ${key}`);
      }
    }
  }
}

requireFile("apps/desktop/scripts/notarize.cjs");
if (exists("apps/desktop/scripts/notarize.cjs")) {
  const notarizeScript = read("apps/desktop/scripts/notarize.cjs");
  for (const requiredText of [
    "STREAMER_NOTARIZE",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ]) {
    if (!notarizeScript.includes(requiredText)) {
      fail(`notarization script must reference ${requiredText}`);
    }
  }
}

requireFile("docs/MACOS_RELEASE.md");
if (exists("docs/MACOS_RELEASE.md")) {
  const docs = read("docs/MACOS_RELEASE.md");
  for (const requiredText of [
    "package:mac:release",
    "STREAMER_NOTARIZE=true",
    "APPLE_TEAM_ID",
    "codesign",
    "spctl",
    "stapler",
  ]) {
    if (!docs.includes(requiredText)) {
      fail(`docs/MACOS_RELEASE.md must document ${requiredText}`);
    }
  }
}

if (failures.length > 0) {
  console.error("[desktop] Release config validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[desktop] Release signing and notarization config is valid.");
