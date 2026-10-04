import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

export const REVIEWED_ADVISORIES = Object.freeze({});

export const LOCAL_SECURITY_PATCHES = Object.freeze({
  "GHSA-VFJ7-8CJW-P6XM": {
    dependency: "braces",
    version: "3.0.3",
    reviewBy: "2026-10-18",
    owner: "mobile platform maintainers",
    reason:
      "The published braces 3.0.3 package has no upstream fix; the parser now bounds nesting before recursive AST walkers run.",
    nextAction:
      "Re-check the upstream advisory by 2026-10-18 and remove this local patch when a fixed braces 3.x release is available and resolved.",
    scope:
      "braces@3.0.3 at node_modules/braces, currently used by Tailwind CSS 3.4.19",
    allowedNodes: ["node_modules/braces"],
    packageJsonPath: "node_modules/braces/package.json",
    sourcePath: "node_modules/braces/lib/parse.js",
    patchFile: "patches/braces+3.0.3.patch",
    sourceMarkers: ["const MAX_DEPTH = 100;", "if (stack.length > MAX_DEPTH)"],
  },
  "GHSA-86W9-CPQP-85RV": {
    dependency: "node-forge",
    version: "1.4.0",
    reviewBy: "2026-10-18",
    owner: "mobile platform maintainers",
    reason:
      "The published node-forge 1.4.0 package has no upstream release fix; verification now rejects unconsumed nested DigestAlgorithm elements.",
    nextAction:
      "Re-check upstream PR #1152 by 2026-10-18 and remove this local patch when a fixed node-forge release is available and resolved.",
    scope:
      "node-forge@1.4.0 at node_modules/node-forge, used by Expo SDK 57 and @expo/cli 57.0.27",
    allowedNodes: ["node_modules/node-forge"],
    packageJsonPath: "node_modules/node-forge/package.json",
    sourcePath: "node_modules/node-forge/lib/rsa.js",
    patchFile: "patches/node-forge+1.4.0.patch",
    sourceMarkers: ["CVE-2026-85393", "obj.value[0].value.length !=="],
  },
});

function advisoryId(url) {
  if (typeof url !== "string") return null;
  return url.match(/GHSA-[a-z0-9-]+$/i)?.[0]?.toUpperCase() ?? null;
}

function isExceptionActive(exception, now) {
  const expiresAt = Date.parse(`${exception.expiresOn}T23:59:59.999Z`);
  return (
    typeof exception.owner === "string" &&
    exception.owner.trim().length > 0 &&
    typeof exception.reason === "string" &&
    exception.reason.trim().length > 0 &&
    typeof exception.nextAction === "string" &&
    exception.nextAction.trim().length > 0 &&
    typeof exception.scope === "string" &&
    exception.scope.trim().length > 0 &&
    Number.isFinite(expiresAt) &&
    now.getTime() <= expiresAt
  );
}

function isLocalPatchActive(patch, now, root) {
  const reviewBy = Date.parse(`${patch.reviewBy}T23:59:59.999Z`);
  if (
    typeof patch.owner !== "string" ||
    !patch.owner.trim() ||
    typeof patch.reason !== "string" ||
    !patch.reason.trim() ||
    typeof patch.nextAction !== "string" ||
    !patch.nextAction.trim() ||
    typeof patch.scope !== "string" ||
    !patch.scope.trim() ||
    !Number.isFinite(reviewBy) ||
    now.getTime() > reviewBy
  ) {
    return false;
  }

  try {
    const packageJson = JSON.parse(
      readFileSync(join(root, patch.packageJsonPath), "utf8"),
    );
    const source = readFileSync(join(root, patch.sourcePath), "utf8");
    const patchSource = readFileSync(join(root, patch.patchFile), "utf8");
    return (
      packageJson.version === patch.version &&
      patchSource.length > 0 &&
      patch.sourceMarkers.every((marker) => source.includes(marker))
    );
  } catch {
    return false;
  }
}

export function evaluateAuditReport(
  report,
  {
    now = new Date(),
    exceptions = REVIEWED_ADVISORIES,
    localPatches = LOCAL_SECURITY_PATCHES,
    root = process.cwd(),
  } = {},
) {
  const blocking = [];
  const reviewed = [];
  const patched = [];
  const seen = new Set();

  for (const vulnerability of Object.values(report?.vulnerabilities ?? {})) {
    for (const via of vulnerability?.via ?? []) {
      if (
        typeof via !== "object" ||
        !via ||
        !BLOCKING_SEVERITIES.has(via.severity)
      ) {
        continue;
      }

      const id = advisoryId(via.url);
      const nodes = [...(vulnerability.nodes ?? [])].sort();
      const key = `${id ?? `${via.name}:${via.source}`}:${nodes.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const exception = id ? exceptions[id] : undefined;
      const localPatch = id ? localPatches[id] : undefined;
      const allowedNodes = exception?.allowedNodes;
      const nodesMatch =
        Array.isArray(allowedNodes) &&
        allowedNodes.length === nodes.length &&
        nodes.every((node, index) => node === allowedNodes[index]);
      const patchNodesMatch =
        Array.isArray(localPatch?.allowedNodes) &&
        localPatch.allowedNodes.length === nodes.length &&
        nodes.every((node, index) => node === localPatch.allowedNodes[index]);
      if (
        localPatch &&
        localPatch.dependency === via.name &&
        patchNodesMatch &&
        isLocalPatchActive(localPatch, now, root)
      ) {
        patched.push({ id, advisory: via, patch: localPatch });
      } else if (
        exception &&
        exception.dependency === via.name &&
        nodesMatch &&
        isExceptionActive(exception, now)
      ) {
        reviewed.push({ id, advisory: via, exception });
      } else {
        blocking.push({ id, advisory: via, exception });
      }
    }
  }

  return { blocking, reviewed, patched };
}

function runAudit() {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : "npm";
  const args = npmExecPath
    ? [npmExecPath, "audit", "--omit=dev", "--json"]
    : ["audit", "--omit=dev", "--json"];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    console.error(`Dependency audit could not start: ${result.error.message}`);
    return 1;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error("Dependency audit did not return valid JSON.");
    if (result.stderr) console.error(result.stderr.trim());
    return 1;
  }
  if (
    report?.error ||
    typeof report?.auditReportVersion !== "number" ||
    !report?.vulnerabilities ||
    typeof report.vulnerabilities !== "object"
  ) {
    console.error("Dependency audit returned an invalid or error response.");
    if (report?.error) console.error(JSON.stringify(report.error));
    return 1;
  }

  const { blocking, reviewed, patched } = evaluateAuditReport(report);
  for (const finding of patched) {
    console.warn(
      `Verified local security patch: ${finding.id} (${finding.advisory.name}); ` +
        `owner: ${finding.patch.owner}; review by ${finding.patch.reviewBy}; ` +
        `scope: ${finding.patch.scope}; next: ${finding.patch.nextAction}.`,
    );
  }
  for (const finding of reviewed) {
    console.warn(
      `Reviewed dependency finding: ${finding.id} (${finding.advisory.name}); ` +
        `owner: ${finding.exception.owner}; expires ${finding.exception.expiresOn}; ` +
        `scope: ${finding.exception.scope}; next: ${finding.exception.nextAction}.`,
    );
  }

  if (blocking.length > 0) {
    console.error("Blocking high/critical dependency advisories:");
    for (const finding of blocking) {
      console.error(
        `- ${finding.id ?? finding.advisory.source}: ` +
          `${finding.advisory.name} — ${finding.advisory.title}`,
      );
    }
    return 1;
  }

  console.log(
    `Dependency audit passed with ${patched.length} verified local security patch(es) and ${reviewed.length} reviewed exception(s).`,
  );
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runAudit();
}
