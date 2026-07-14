import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const packageLock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);

function packageNameFromLockPath(lockPath) {
  const marker = "node_modules/";
  const markerIndex = lockPath.lastIndexOf(marker);
  if (markerIndex === -1) return null;

  const relative = lockPath.slice(markerIndex + marker.length);
  const segments = relative.split("/");
  if (segments[0]?.startsWith("@") && segments[1]) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0] || null;
}

function isReviewed(policy, name, version) {
  if (policy[name] === false) return true;
  return policy[`${name}@${version}`] === true;
}

const policy = packageJson.allowScripts || {};
const pending = [];
const installedScriptPackages = new Set();

for (const [lockPath, metadata] of Object.entries(packageLock.packages || {})) {
  if (!metadata?.hasInstallScript) continue;

  const name = packageNameFromLockPath(lockPath);
  if (!name || !metadata.version) continue;
  installedScriptPackages.add(`${name}@${metadata.version}`);
  if (!isReviewed(policy, name, metadata.version)) {
    pending.push(`${name}@${metadata.version}`);
  }
}

for (const [entry, decision] of Object.entries(policy)) {
  if (decision !== true && decision !== false) {
    pending.push(`${entry} has a non-boolean policy decision`);
    continue;
  }
  if (decision !== true) continue;
  if (!entry.includes("@", 1)) {
    pending.push(`${entry} is approved without a version pin`);
  } else if (!installedScriptPackages.has(entry)) {
    pending.push(`${entry} is a stale install-script approval`);
  }
}

if (pending.length > 0) {
  console.error("Unreviewed dependency install scripts:");
  for (const entry of [...new Set(pending)].sort()) {
    console.error(`- ${entry}`);
  }
  process.exit(1);
}

console.log("Dependency install-script policy is complete and version-pinned.");
