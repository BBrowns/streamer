import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_OUTPUT = 4 * 1024 * 1024;
const WORKFLOW_EXTENSIONS = new Set([".yml", ".yaml"]);
const DEFAULT_PROTECTED_BRANCHES = Object.freeze(["main", "master"]);
const MAX_CI_JOB_RUNS = 20;
const CI_WORKFLOW_FILE = "ci.yml";
const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const PREFLIGHT_JOB_NAME = "Dependency Install Preflight";
const PREFLIGHT_DOWNSTREAM_JOB_PATTERNS = Object.freeze([
  /^Lint & Type Check$/,
  /^Format Check$/,
  /^Security Audit$/,
  /^Shared Tests$/,
  /^Server Tests$/,
  /^Stream Server Tests$/,
  /^Mobile Tests$/,
  /^Golden Path Browser Matrix/,
  /^Visual Regression/,
  /^Golden Path Browser Tests$/,
  /^Build Check$/,
  /^Server Production Container$/,
  /^Desktop Package Artifact$/,
]);
const DEFAULT_REQUIRED_CHECK_NAMES = Object.freeze([
  "Release Gate",
  "Review Dependency Changes",
  "CodeQL",
]);
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

function collectVerificationEvidence(root) {
  const candidates = [
    join(root, "artifacts", "verification", "process-evidence.json"),
    join(root, "artifacts", "verification", "verify-change-final.json"),
    join(root, "artifacts", "verification", "verify-change-focused.json"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const receipt = JSON.parse(readFileSync(file, "utf8"));
      return {
        available: true,
        source: relative(root, file),
        status: receipt.status ?? "unknown",
        generatedAt: receipt.generatedAt ?? null,
        notRun: Array.isArray(receipt.notRun) ? receipt.notRun.length : 0,
      };
    } catch {
      return {
        available: true,
        source: relative(root, file),
        status: "invalid",
        generatedAt: null,
        notRun: 0,
      };
    }
  }
  return {
    available: false,
    source: null,
    status: "unknown",
    generatedAt: null,
    notRun: 0,
  };
}

function parseTimestamp(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function medianDuration(entries, startField, endField) {
  const durations = entries
    .map((entry) => {
      const start = parseTimestamp(entry?.[startField]);
      const end = parseTimestamp(entry?.[endField]);
      return start !== null && end !== null && end >= start
        ? Math.round((end - start) / 1000)
        : null;
    })
    .filter((value) => value !== null);
  return { sampled: durations.length, median: median(durations) };
}

function normalizeBranch(value) {
  return String(value ?? "").replace(/^refs\/heads\//, "");
}

function workflowRunKey(
  entry,
  { openPullRequestHeadShas = new Set(), protectedBranches = new Set() } = {},
) {
  const workflow =
    entry?.workflow_id ?? entry?.workflow_name ?? entry?.name ?? "unknown";
  const headSha = entry?.head_sha;
  const branch = normalizeBranch(entry?.head_branch ?? entry?.ref);
  const ref =
    headSha && openPullRequestHeadShas.has(headSha)
      ? `sha:${headSha}`
      : branch && protectedBranches.has(branch)
        ? `branch:${branch}`
        : headSha
          ? `sha:${headSha}`
          : `branch:${branch}`;
  return `${workflow}|${ref}`;
}

function isTrackedWorkflowRun(
  entry,
  openPullRequestHeadShas,
  protectedBranches,
) {
  const headSha = entry?.head_sha;
  const branch = normalizeBranch(entry?.head_branch ?? entry?.ref);
  return (
    (headSha && openPullRequestHeadShas.has(headSha)) ||
    (branch && protectedBranches.has(branch))
  );
}

function activeWorkflowRunSet(
  entries,
  { openPullRequestHeadShas, protectedBranches },
) {
  const latestByKey = new Map();
  entries.forEach((entry) => {
    if (
      !isTrackedWorkflowRun(entry, openPullRequestHeadShas, protectedBranches)
    ) {
      return;
    }
    const key = workflowRunKey(entry, {
      openPullRequestHeadShas,
      protectedBranches,
    });
    const current = latestByKey.get(key);
    const currentTimestamp = parseTimestamp(
      current?.updated_at ?? current?.created_at,
    );
    const entryTimestamp = parseTimestamp(
      entry?.updated_at ?? entry?.created_at,
    );
    if (
      !current ||
      (entryTimestamp !== null &&
        (currentTimestamp === null || entryTimestamp >= currentTimestamp))
    ) {
      latestByKey.set(key, entry);
    }
  });
  return new Set(latestByKey.values());
}

export function getOpenPullRequestHeadShas(data) {
  const entries = Array.isArray(data) ? data : [];
  return [
    ...new Set(
      entries
        .map((entry) => entry?.head?.sha)
        .filter((sha) => typeof sha === "string" && sha.length > 0),
    ),
  ];
}

export function summarizeCiJobs(data) {
  const entries = Array.isArray(data?.jobs)
    ? data.jobs
    : Array.isArray(data)
      ? data
      : [];
  const preflight = entries.find((job) => job?.name === PREFLIGHT_JOB_NAME);
  if (!preflight) {
    return { runs: 0, failures: 0, cancelled: 0, skippedAfterFailure: 0 };
  }
  const failed = preflight.conclusion === "failure";
  const cancelled = preflight.conclusion === "cancelled";
  const skippedAfterFailure =
    failed || cancelled
      ? entries.filter(
          (job) =>
            job?.conclusion === "skipped" &&
            PREFLIGHT_DOWNSTREAM_JOB_PATTERNS.some((pattern) =>
              pattern.test(String(job?.name ?? "")),
            ),
        ).length
      : 0;
  return {
    runs: preflight.conclusion === "skipped" ? 0 : 1,
    failures: failed ? 1 : 0,
    cancelled: cancelled ? 1 : 0,
    skippedAfterFailure,
  };
}

function combineCiJobSummaries(summaries) {
  return summaries.reduce(
    (total, summary) => ({
      runs: total.runs + summary.runs,
      failures: total.failures + summary.failures,
      cancelled: total.cancelled + summary.cancelled,
      skippedAfterFailure:
        total.skippedAfterFailure + summary.skippedAfterFailure,
    }),
    { runs: 0, failures: 0, cancelled: 0, skippedAfterFailure: 0 },
  );
}

export function extractRequiredCheckContexts(ruleset) {
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : [];
  const contexts = [];
  for (const rule of rules) {
    if (rule?.type !== "required_status_checks") continue;
    const checks =
      rule?.parameters?.required_status_checks ??
      rule?.parameters?.requiredStatusChecks ??
      [];
    for (const check of Array.isArray(checks) ? checks : []) {
      const context =
        typeof check === "string"
          ? check
          : (check?.context ?? check?.context_name ?? check?.name);
      if (typeof context === "string" && context.length > 0) {
        contexts.push(context);
      }
    }
  }
  return contexts;
}

export function compareRequiredCheckContexts(expected, actual) {
  const expectedNames = [
    ...new Set(
      (Array.isArray(expected) ? expected : [])
        .map((entry) => (typeof entry === "string" ? entry : entry?.name))
        .filter((name) => typeof name === "string" && name.length > 0),
    ),
  ];
  const actualNames = (Array.isArray(actual) ? actual : []).filter(
    (name) => typeof name === "string" && name.length > 0,
  );
  const counts = new Map();
  for (const name of actualNames) counts.set(name, (counts.get(name) ?? 0) + 1);
  return {
    available: actualNames.length > 0,
    missing: expectedNames.filter((name) => !actualNames.includes(name)),
    unexpected: [
      ...new Set(actualNames.filter((name) => !expectedNames.includes(name))),
    ],
    duplicate: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  };
}

function readRequiredCheckNames(root) {
  const file = join(root, ".github", "required-checks.json");
  if (!existsSync(file)) return DEFAULT_REQUIRED_CHECK_NAMES;
  try {
    const configured = JSON.parse(readFileSync(file, "utf8"));
    const names = (
      Array.isArray(configured?.requiredContexts)
        ? configured.requiredContexts
        : []
    )
      .map((entry) => entry?.name)
      .filter((name) => typeof name === "string" && name.length > 0);
    return names.length > 0 ? names : DEFAULT_REQUIRED_CHECK_NAMES;
  } catch {
    return DEFAULT_REQUIRED_CHECK_NAMES;
  }
}

function isCiWorkflowRun(entry) {
  return (
    entry?.name === "CI" ||
    entry?.workflow_name === "CI" ||
    entry?.path === ".github/workflows/ci.yml"
  );
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
    ci: {
      runs: 0,
      failures: 0,
      cancelled: 0,
      activeFailures: 0,
      historicalFailures: 0,
      activeCancelled: 0,
      historicalCancelled: 0,
      reruns: 0,
      queueSeconds: { sampled: 0, median: null },
      durationSeconds: { sampled: 0, median: null },
      preflight: {
        available: false,
        runs: 0,
        failures: 0,
        cancelled: 0,
        skippedAfterFailure: 0,
      },
    },
    prs: { available: false, open: 0, drafts: 0, dependabot: 0 },
    codeql: { available: false, open: 0, bySeverity: {} },
    dependabot: { available: false, open: 0, bySeverity: {} },
    permissions: null,
    rulesets: null,
  };

  const pulls = call("pulls?state=open&per_page=100");
  let pullData = null;
  if (pulls.ok) {
    successfulSources += 1;
    pullData = parseJsonOutput(pulls);
    result.prs = summarizeOpenPullRequests(pullData);
  }

  const runs = call(
    `actions/workflows/${CI_WORKFLOW_FILE}/runs?per_page=50&created=>=${encodeURIComponent(since)}`,
  );
  if (runs.ok) {
    successfulSources += 1;
    const data = parseJsonOutput(runs);
    const entries = Array.isArray(data?.workflow_runs)
      ? data.workflow_runs
      : [];
    result.ci = summarizeWorkflowRuns(data, {
      openPullRequestHeadShas: getOpenPullRequestHeadShas(pullData),
      protectedBranches: DEFAULT_PROTECTED_BRANCHES,
    });

    const jobSummaries = [];
    for (const entry of entries.slice(0, MAX_CI_JOB_RUNS)) {
      if (!entry?.id || !isCiWorkflowRun(entry)) continue;
      const jobs = call(
        `actions/runs/${encodeURIComponent(entry.id)}/jobs?per_page=100`,
      );
      if (jobs.ok) jobSummaries.push(summarizeCiJobs(parseJsonOutput(jobs)));
    }
    if (jobSummaries.length > 0) {
      result.ci.preflight = {
        available: true,
        sampledRuns: jobSummaries.length,
        ...combineCiJobSummaries(jobSummaries),
      };
    }
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
    const entries = Array.isArray(data) ? data : [];
    const activeEntries = entries.filter(
      (entry) => entry?.enforcement === "active",
    );
    const detailedEntries = [];
    for (const entry of activeEntries.slice(0, 10)) {
      if (Array.isArray(entry?.rules)) {
        detailedEntries.push(entry);
        continue;
      }
      if (!entry?.id) continue;
      const detail = call(`rulesets/${encodeURIComponent(entry.id)}`);
      if (detail.ok) {
        const detailData = parseJsonOutput(detail);
        if (detailData && typeof detailData === "object") {
          detailedEntries.push(detailData);
        }
      }
    }
    const actualContexts = detailedEntries.flatMap(
      extractRequiredCheckContexts,
    );
    const contract = compareRequiredCheckContexts(
      readRequiredCheckNames(root),
      actualContexts,
    );
    result.rulesets = {
      count: entries.length,
      active: activeEntries.length,
      contract,
    };
  }
  if (successfulSources === 0) {
    result.available = false;
    result.reason = "GitHub API sources were unavailable";
  }
  return result;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export function summarizeWorkflowRuns(data, options = {}) {
  const entries = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
  const outcomes = entries.filter((entry) =>
    ["failure", "cancelled"].includes(entry?.conclusion),
  );
  const hasTrackingContext =
    Object.hasOwn(options, "openPullRequestHeadShas") ||
    Object.hasOwn(options, "protectedBranches");
  const activeSet = hasTrackingContext
    ? activeWorkflowRunSet(entries, {
        openPullRequestHeadShas: new Set(options.openPullRequestHeadShas ?? []),
        protectedBranches: new Set(
          options.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES,
        ),
      })
    : new Set(outcomes);
  const failures = entries.filter((entry) => entry?.conclusion === "failure");
  const cancelled = entries.filter(
    (entry) => entry?.conclusion === "cancelled",
  );
  return {
    runs: entries.length,
    failures: failures.length,
    cancelled: cancelled.length,
    activeFailures: failures.filter((entry) => activeSet.has(entry)).length,
    historicalFailures: failures.filter((entry) => !activeSet.has(entry))
      .length,
    activeCancelled: cancelled.filter((entry) => activeSet.has(entry)).length,
    historicalCancelled: cancelled.filter((entry) => !activeSet.has(entry))
      .length,
    reruns: entries.filter((entry) => Number(entry?.run_attempt) > 1).length,
    queueSeconds: medianDuration(entries, "created_at", "run_started_at"),
    durationSeconds: medianDuration(entries, "run_started_at", "updated_at"),
  };
}

export function summarizeOpenPullRequests(data) {
  const entries = Array.isArray(data) ? data : [];
  return {
    available: true,
    open: entries.length,
    drafts: entries.filter((entry) => entry?.draft === true).length,
    dependabot: entries.filter(
      (entry) => entry?.user?.login === "dependabot[bot]",
    ).length,
  };
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
    verification: collectVerificationEvidence(root),
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
      `cancelled: ${remote.ci.cancelled ?? "unavailable"}; open PRs: ${remote.prs?.open ?? "unavailable"}; ` +
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
