import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_OUTPUT = 4 * 1024 * 1024;
const WORKFLOW_EXTENSIONS = new Set([".yml", ".yaml"]);
const IGNORED_DIRS = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "graphify-out",
  ".agent-memory",
]);

function parseArgs(argv) {
  const args = { json: false, sinceDays: 7 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      args.json = true;
      continue;
    }
    if (value === "--since-days") {
      const days = Number(argv[index + 1]);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new Error("--since-days must be an integer between 1 and 365");
      }
      args.sinceDays = days;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function run(command, args, { cwd, maxBuffer = MAX_OUTPUT } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

function parseJsonOutput(result) {
  if (!result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function gitValue(root, args) {
  const result = run("git", args, { cwd: root });
  return result.ok ? result.stdout.trim() : null;
}

export function parseRemote(remote) {
  if (!remote) return null;
  const normalized = remote
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)
    ? normalized
    : null;
}

function collectWorkflowFiles(root) {
  const directory = join(root, ".github", "workflows");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) =>
      WORKFLOW_EXTENSIONS.has(file.slice(file.lastIndexOf("."))),
    )
    .map((file) => join(directory, file));
}

export function parseActionPins(root) {
  const unpinned = [];
  let actionCount = 0;
  for (const file of collectWorkflowFiles(root)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      let match = line.match(/\buses:\s*([^\s#]+)@([^\s#]+)/);
      if (!match && /^\s*(?:-\s*)?uses:\s*[>|][-+]?\s*$/.test(line)) {
        match = lines[index + 1]?.trim().match(/^([^\s#]+)@([^\s#]+)/);
      }
      if (!match || match[1].startsWith("./")) return;
      actionCount += 1;
      if (!/^[0-9a-f]{40}$/i.test(match[2])) {
        unpinned.push({
          file: relative(root, file),
          line: index + 1,
          action: match[1],
        });
      }
    });
  }
  return {
    workflowCount: collectWorkflowFiles(root).length,
    actionCount,
    unpinnedCount: unpinned.length,
    unpinned: unpinned.slice(0, 20),
    truncated: unpinned.length > 20,
  };
}

export function summarizeAudit(report) {
  const vulnerabilities = Object.values(report?.vulnerabilities ?? {});
  const counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
  for (const vulnerability of vulnerabilities) {
    const severity = String(vulnerability?.severity ?? "info").toLowerCase();
    counts[severity] = (counts[severity] ?? 0) + 1;
  }
  return {
    available: Boolean(report && typeof report === "object"),
    total: vulnerabilities.length,
    counts,
  };
}

export function summarizeOutdated(report) {
  const packages = Object.entries(report ?? {}).map(([name, value]) => ({
    name,
    current: value?.current ?? null,
    wanted: value?.wanted ?? null,
    latest: value?.latest ?? null,
  }));
  return {
    available: report !== null,
    count: packages.length,
    packages: packages.slice(0, 25),
    truncated: packages.length > 25,
  };
}

function collectExceptions(root, now) {
  const file = join(root, "scripts", "security-audit.mjs");
  if (!existsSync(file)) return { available: false, expired: [], expiring: [] };
  const source = readFileSync(file, "utf8");
  const dates = [
    ...source.matchAll(/expiresOn:\s*["'](\d{4}-\d{2}-\d{2})["']/g),
  ].map(([, date]) => date);
  const threshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    available: true,
    expired: dates.filter((date) => new Date(`${date}T23:59:59Z`) < now),
    expiring: dates.filter((date) => {
      const expires = new Date(`${date}T23:59:59Z`);
      return expires >= now && expires <= threshold;
    }),
  };
}

function countTrackedFiles(root) {
  const result = run("git", ["status", "--short"], { cwd: root });
  if (!result.ok) return { available: false, changed: 0, untracked: 0 };
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  return {
    available: true,
    changed: lines.filter((line) => !line.startsWith("??")).length,
    untracked: lines.filter((line) => line.startsWith("??")).length,
  };
}

function collectRemote(repo, since, root) {
  if (!repo)
    return { available: false, reason: "GitHub origin is unavailable" };
  const endpoint = (path) => `repos/${repo}/${path}`;
  const call = (path) => run("gh", ["api", endpoint(path)], { cwd: root });
  let successfulSources = 0;
  const result = {
    available: true,
    repository: repo,
    ci: { runs: 0, failures: 0, cancelled: 0 },
    codeql: { available: false, open: 0, bySeverity: {} },
    dependabot: { available: false, open: 0, bySeverity: {} },
    permissions: null,
    rulesets: null,
  };

  const runs = call(
    `actions/runs?per_page=50&created=>=${encodeURIComponent(since)}`,
  );
  if (runs.ok) {
    successfulSources += 1;
    const data = parseJsonOutput(runs);
    const entries = Array.isArray(data?.workflow_runs)
      ? data.workflow_runs
      : [];
    result.ci.runs = entries.length;
    result.ci.failures = entries.filter(
      (entry) => entry.conclusion === "failure",
    ).length;
    result.ci.cancelled = entries.filter(
      (entry) => entry.conclusion === "cancelled",
    ).length;
  } else {
    result.ci = { available: false };
  }

  const codeql = call("code-scanning/alerts?state=open&per_page=100");
  if (codeql.ok) {
    successfulSources += 1;
    const alerts = parseJsonOutput(codeql);
    const entries = Array.isArray(alerts) ? alerts : [];
    result.codeql.available = true;
    result.codeql.open = entries.length;
    for (const entry of entries) {
      const severity = entry?.rule?.security_severity_level ?? "unknown";
      result.codeql.bySeverity[severity] =
        (result.codeql.bySeverity[severity] ?? 0) + 1;
    }
  }

  const dependabot = call("dependabot/alerts?state=open&per_page=100");
  if (dependabot.ok) {
    successfulSources += 1;
    const alerts = parseJsonOutput(dependabot);
    const entries = Array.isArray(alerts) ? alerts : [];
    result.dependabot.available = true;
    result.dependabot.open = entries.length;
    for (const entry of entries) {
      const severity = entry?.security_advisory?.severity ?? "unknown";
      result.dependabot.bySeverity[severity] =
        (result.dependabot.bySeverity[severity] ?? 0) + 1;
    }
  }

  const permissions = call("actions/permissions");
  if (permissions.ok) {
    successfulSources += 1;
    const data = parseJsonOutput(permissions);
    result.permissions = {
      enabled: data?.enabled ?? null,
      allowedActions: data?.allowed_actions ?? null,
      shaPinningRequired: data?.sha_pinning_required ?? null,
    };
  }

  const rulesets = call("rulesets");
  if (rulesets.ok) {
    successfulSources += 1;
    const data = parseJsonOutput(rulesets);
    result.rulesets = {
      count: Array.isArray(data) ? data.length : null,
      active: Array.isArray(data)
        ? data.filter((entry) => entry?.enforcement === "active").length
        : null,
    };
  }
  if (successfulSources === 0) {
    result.available = false;
    result.reason = "GitHub API sources were unavailable";
  }
  return result;
}

function collectLocal(root, now, sinceDays) {
  const audit = run("npm", ["audit", "--omit=dev", "--json"], { cwd: root });
  const auditPolicy = run("npm", ["run", "security:audit"], { cwd: root });
  const outdated = run("npm", ["outdated", "--json"], { cwd: root });
  const auditReport = parseJsonOutput(audit);
  const outdatedReport = parseJsonOutput(outdated);
  const recent = run(
    "git",
    ["log", `--since=${sinceDays} days ago`, "--format=%H"],
    {
      cwd: root,
    },
  );
  return {
    files: countTrackedFiles(root),
    workflows: parseActionPins(root),
    exceptions: collectExceptions(root, now),
    audit: summarizeAudit(auditReport),
    auditPolicy: { available: true, passed: auditPolicy.ok },
    outdated: summarizeOutdated(outdatedReport),
    recentCommits: recent.ok
      ? recent.stdout.split(/\r?\n/).filter(Boolean).length
      : null,
  };
}

export function collectEvidence({
  root = process.cwd(),
  sinceDays = 7,
  now = new Date(),
} = {}) {
  const since = new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000);
  const remote = parseRemote(gitValue(root, ["remote", "get-url", "origin"]));
  return {
    generatedAt: now.toISOString(),
    lookback: { days: sinceDays, since: since.toISOString() },
    repository: {
      branch: gitValue(root, ["branch", "--show-current"]),
      commit: gitValue(root, ["rev-parse", "HEAD"]),
      repository: remote,
    },
    local: collectLocal(root, now, sinceDays),
    remote: collectRemote(remote, since.toISOString(), root),
  };
}

function printHuman(evidence) {
  const { local, remote, lookback, repository } = evidence;
  console.log(
    `Maintenance evidence for ${repository.repository ?? "local repository"}`,
  );
  console.log(
    `Revision: ${repository.commit ?? "unknown"}; lookback: ${lookback.days} days`,
  );
  console.log(
    `CI runs: ${remote.ci.runs ?? "unavailable"}; failures: ${remote.ci.failures ?? "unavailable"}; ` +
      `open CodeQL: ${remote.codeql.open ?? "unavailable"}; outdated packages: ${local.outdated.count ?? "unavailable"}`,
  );
  console.log(
    `Action pin violations: ${local.workflows.unpinnedCount}; expired exceptions: ${local.exceptions.expired.length}; ` +
      `unavailable remote sources: ${remote.available ? "none reported" : "GitHub"}`,
  );
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const evidence = collectEvidence({ sinceDays: args.sinceDays });
  if (args.json) console.log(JSON.stringify(evidence, null, 2));
  else printHuman(evidence);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
