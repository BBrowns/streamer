import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

export const REVIEWED_ADVISORIES = Object.freeze({
  "GHSA-MH99-V99M-4GVG": {
    dependency: "brace-expansion",
    expiresOn: "2026-09-30",
    scope: "repository-controlled transform, test, and packaging globs",
    allowedNodes: ["node_modules/test-exclude/node_modules/brace-expansion"],
  },
});

function advisoryId(url) {
  if (typeof url !== "string") return null;
  return url.match(/GHSA-[a-z0-9-]+$/i)?.[0]?.toUpperCase() ?? null;
}

function isExceptionActive(exception, now) {
  const expiresAt = Date.parse(`${exception.expiresOn}T23:59:59.999Z`);
  return Number.isFinite(expiresAt) && now.getTime() <= expiresAt;
}

export function evaluateAuditReport(
  report,
  { now = new Date(), exceptions = REVIEWED_ADVISORIES } = {},
) {
  const blocking = [];
  const reviewed = [];
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
      const nodesMatch =
        exception?.allowedNodes.length === nodes.length &&
        nodes.every((node, index) => node === exception.allowedNodes[index]);
      if (
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

  return { blocking, reviewed };
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

  const { blocking, reviewed } = evaluateAuditReport(report);
  for (const finding of reviewed) {
    console.warn(
      `Reviewed dependency finding: ${finding.id} (${finding.advisory.name}); ` +
        `expires ${finding.exception.expiresOn}; scope: ${finding.exception.scope}.`,
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
    `Dependency audit passed with ${reviewed.length} reviewed advisory exception(s).`,
  );
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runAudit();
}
