import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { collectEvidence } from "./maintenance-collect.mjs";

const PRIORITY_ORDER = Object.freeze({ Now: 0, Next: 1, Watch: 2 });
const BLOCKING_SEVERITIES = new Set(["critical", "high"]);

function hasBlockingSeverity(counts = {}) {
  return [...BLOCKING_SEVERITIES].some(
    (severity) => (counts[severity] ?? 0) > 0,
  );
}

function addFinding(findings, finding) {
  findings.push({
    ...finding,
    priority: finding.priority,
  });
}

export function classifyEvidence(evidence) {
  const findings = [];
  const { local, remote } = evidence;
  const ci = remote.ci ?? {};
  const hasActiveFailureMetric = Object.hasOwn(ci, "activeFailures");
  const hasActiveCancellationMetric = Object.hasOwn(ci, "activeCancelled");
  const activeFailures = hasActiveFailureMetric
    ? ci.activeFailures
    : ci.failures;
  const historicalFailures = hasActiveFailureMetric ? ci.historicalFailures : 0;
  const activeCancelled = hasActiveCancellationMetric
    ? ci.activeCancelled
    : ci.cancelled;
  const historicalCancelled = hasActiveCancellationMetric
    ? ci.historicalCancelled
    : 0;

  const rawAuditHasBlockingSeverity = hasBlockingSeverity(local.audit?.counts);
  const auditPolicyFailed =
    local.auditPolicy?.available === false
      ? rawAuditHasBlockingSeverity
      : local.auditPolicy?.passed === false;

  if (auditPolicyFailed) {
    addFinding(findings, {
      priority: "Now",
      key: "local-production-audit",
      title: "Production dependency audit has blocking advisories",
      evidence: `${local.audit.counts.critical ?? 0} critical and ${local.audit.counts.high ?? 0} high finding(s) in the production audit.`,
      owner: "Platform maintainers",
      nextAction:
        "Create a focused remediation or a reviewed, expiring containment exception.",
      closeWhen:
        "The production audit is clean or every remaining finding has an exact active exception.",
    });
  }

  if (!auditPolicyFailed && rawAuditHasBlockingSeverity) {
    addFinding(findings, {
      priority: "Watch",
      key: "reviewed-audit-exceptions",
      title: "Production audit findings are covered by reviewed exceptions",
      evidence: `${local.audit.counts.critical ?? 0} critical and ${local.audit.counts.high ?? 0} high raw audit record(s) remain under the project audit policy.`,
      owner: "Platform maintainers",
      nextAction:
        "Track each exception owner and remove the exception by its review deadline or before the next release candidate.",
      closeWhen: "The raw audit is clean and no exception is required.",
    });
  }

  if ((activeFailures ?? 0) > 0) {
    addFinding(findings, {
      priority: "Now",
      key: "ci-failures",
      title: "Recent required CI runs failed",
      evidence: `${activeFailures} active failed run(s) in the selected lookback.`,
      owner: "Change owner of the failing workflow",
      nextAction:
        "Open the latest failing run and repair the first reproducible failure.",
      closeWhen:
        "A fresh run passes all required jobs without bypassing a gate.",
    });
  }

  if ((historicalFailures ?? 0) > 0) {
    addFinding(findings, {
      priority: "Watch",
      key: "historical-ci-failures",
      title: "Historical CI failures remain as trend evidence",
      evidence: `${historicalFailures} failed run(s) were not associated with a current open pull request or latest protected-branch run and remain outside the active repair queue.`,
      owner: "Delivery maintainer",
      nextAction:
        "Retain the count for trend analysis and investigate only if the same root recurs.",
      closeWhen:
        "The historical failure count is explained by later successful runs or closed changes.",
    });
  }

  if (hasBlockingSeverity(remote.codeql?.bySeverity)) {
    addFinding(findings, {
      priority: "Now",
      key: "codeql-alerts",
      title: "Open high-severity CodeQL alerts remain",
      evidence: `${remote.codeql.open} open CodeQL alert(s), including high or critical severity.`,
      owner: "Security reviewer plus owning module maintainer",
      nextAction:
        "Triage reachability, then fix or document a verified false positive.",
      closeWhen:
        "No high or critical alert remains open on the default branch.",
    });
  }

  if (hasBlockingSeverity(remote.dependabot?.bySeverity)) {
    addFinding(findings, {
      priority: "Now",
      key: "dependabot-alerts",
      title: "Open high-severity Dependabot alerts remain",
      evidence: `${remote.dependabot.open} open Dependabot alert(s), including high or critical severity.`,
      owner: "Owning package maintainer",
      nextAction:
        "Remediate the smallest compatible dependency path and run the affected runtime matrix.",
      closeWhen:
        "The alert is patched, removed, or has an explicitly approved expiring containment record.",
    });
  }

  if ((local.exceptions?.expired?.length ?? 0) > 0) {
    addFinding(findings, {
      priority: "Now",
      key: "expired-exceptions",
      title: "Dependency security exceptions have expired",
      evidence: `${local.exceptions.expired.length} exception date(s) are past their deadline.`,
      owner: "Platform maintainers",
      nextAction:
        "Remove the exception by upgrading or create a reviewed replacement with a new owner and deadline.",
      closeWhen: "No expired exception is accepted by the audit policy.",
    });
  }

  if ((activeCancelled ?? 0) > 0) {
    addFinding(findings, {
      priority: "Next",
      key: "cancelled-ci",
      title: "CI runs were cancelled in the lookback",
      evidence: `${activeCancelled} active cancellation(s) were observed.`,
      owner: "Delivery maintainer",
      nextAction:
        "Confirm cancellations are superseded PR runs and not timeout or capacity symptoms.",
      closeWhen:
        "Cancellations are explained or the workflow no longer cancels unexpectedly.",
    });
  }

  if ((historicalCancelled ?? 0) > 0) {
    addFinding(findings, {
      priority: "Watch",
      key: "historical-ci-cancellations",
      title: "Historical CI cancellations remain as trend evidence",
      evidence: `${historicalCancelled} cancellation(s) were not associated with a current open pull request or latest protected-branch run and remain outside the active repair queue.`,
      owner: "Delivery maintainer",
      nextAction:
        "Keep the count as a trend signal and check only recurring unexplained cancellations.",
      closeWhen:
        "Historical cancellations are explained by newer runs or closed changes.",
    });
  }

  const requiredCheckContract = remote.rulesets?.contract;
  if (
    requiredCheckContract?.available &&
    (requiredCheckContract.missing?.length > 0 ||
      requiredCheckContract.unexpected?.length > 0 ||
      requiredCheckContract.duplicate?.length > 0)
  ) {
    addFinding(findings, {
      priority: "Now",
      key: "required-check-drift",
      title: "Remote required-check contract has drifted",
      evidence: [
        requiredCheckContract.missing?.length > 0
          ? `missing: ${requiredCheckContract.missing.join(", ")}`
          : null,
        requiredCheckContract.unexpected?.length > 0
          ? `unexpected: ${requiredCheckContract.unexpected.join(", ")}`
          : null,
        requiredCheckContract.duplicate?.length > 0
          ? `duplicate: ${requiredCheckContract.duplicate.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("; "),
      owner: "Repository administrator plus delivery maintainer",
      nextAction:
        "Compare the protected ruleset with the canonical required-check contract before merging.",
      closeWhen:
        "The active remote ruleset matches the canonical required-check contract.",
    });
  }

  if ((local.exceptions?.expiring?.length ?? 0) > 0) {
    addFinding(findings, {
      priority: "Next",
      key: "expiring-exceptions",
      title: "Dependency security exceptions are nearing their deadline",
      evidence: `${local.exceptions.expiring.length} exception date(s) expire within 30 days.`,
      owner: "Platform maintainers",
      nextAction: "Schedule the owning upgrade before the exception deadline.",
      closeWhen:
        "The dependency is upgraded or the exception is removed before expiry.",
    });
  }

  if ((local.workflows?.unpinnedCount ?? 0) > 0) {
    addFinding(findings, {
      priority: "Next",
      key: "unpinned-actions",
      title: "GitHub Actions are not pinned to full commit SHAs",
      evidence: `${local.workflows.unpinnedCount} of ${local.workflows.actionCount} external action reference(s) are not full-SHA pinned.`,
      owner: "Delivery maintainer",
      nextAction:
        "Pin the affected actions and retain the version comment for reviewability.",
      closeWhen:
        "The workflow pin checker reports zero unpinned external actions.",
    });
  }

  if ((local.outdated?.count ?? 0) > 0) {
    addFinding(findings, {
      priority: "Next",
      key: "outdated-packages",
      title: "Production dependency drift needs triage",
      evidence: `${local.outdated.count} package(s) have newer registry versions.`,
      owner: "Owning package maintainer",
      nextAction:
        "Select only upgrades with a clear security, compatibility, or maintenance benefit.",
      closeWhen:
        "Each material outdated package has a merged update, an owner, or a documented reason to defer.",
    });
  }

  if (remote.available === false) {
    addFinding(findings, {
      priority: "Watch",
      key: "remote-unavailable",
      title: "GitHub evidence was unavailable",
      evidence: remote.reason ?? "The GitHub API source could not be read.",
      owner: "Delivery maintainer",
      nextAction:
        "Run the radar with authenticated GitHub access before using it as a release signal.",
      closeWhen:
        "The next scheduled run collects CI, CodeQL, and Dependabot evidence.",
    });
  }

  return findings.sort((left, right) => {
    const priority =
      PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    return priority || left.key.localeCompare(right.key);
  });
}

function formatFinding(finding) {
  return [
    `### ${finding.title}`,
    `- Evidence: ${finding.evidence}`,
    `- Owner: ${finding.owner}`,
    `- Next action: ${finding.nextAction}`,
    `- Close when: ${finding.closeWhen}`,
  ].join("\n");
}

function metric(value) {
  return value === null || value === undefined ? "unavailable" : value;
}

function renderProcessMetrics(evidence) {
  const ci = evidence.remote?.ci ?? {};
  const prs = evidence.remote?.prs ?? {};
  const duration = ci.durationSeconds?.median;
  const queue = ci.queueSeconds?.median;
  const preflight = ci.preflight ?? {};
  return [
    "## Process Metrics",
    "",
    `- Open PRs: ${metric(prs.open)}`,
    `- Draft PRs: ${metric(prs.drafts)}`,
    `- Dependabot PRs: ${metric(prs.dependabot)}`,
    `- CI runs: ${metric(ci.runs)}; failures: ${metric(ci.failures)}; cancellations: ${metric(ci.cancelled)}`,
    `- Active CI failures: ${metric(ci.activeFailures ?? ci.failures)}`,
    `- Historical CI failures: ${metric(ci.historicalFailures ?? 0)}`,
    `- Active CI cancellations: ${metric(ci.activeCancelled ?? ci.cancelled)}`,
    `- Historical CI cancellations: ${metric(ci.historicalCancelled ?? 0)}`,
    `- CI reruns: ${metric(ci.reruns)}`,
    `- Median CI queue time (sampled runs): ${queue === null || queue === undefined ? "unavailable" : `${queue}s`}`,
    `- Preflight job sample: ${metric(preflight.sampledRuns)} CI run(s)`,
    `- Preflight runs: ${preflight.available === false ? "unavailable" : metric(preflight.runs)}; failures: ${preflight.available === false ? "unavailable" : metric(preflight.failures)}; cancellations: ${preflight.available === false ? "unavailable" : metric(preflight.cancelled)}`,
    `- Downstream jobs skipped after preflight failure: ${preflight.available === false ? "unavailable" : metric(preflight.skippedAfterFailure)}`,
    `- Median CI duration (sampled runs): ${duration === null || duration === undefined ? "unavailable" : `${duration}s`}`,
  ].join("\n");
}

export function renderMarkdown(evidence) {
  const findings = classifyEvidence(evidence);
  const byPriority = (priority) =>
    findings.filter((finding) => finding.priority === priority);
  const sections = [
    `# Streamer Maintenance Radar`,
    "",
    `- Generated: ${evidence.generatedAt}`,
    `- Repository: ${evidence.repository.repository ?? "unavailable"}`,
    `- Revision: ${evidence.repository.commit ?? "unknown"}`,
    `- Lookback: ${evidence.lookback.days} day(s), since ${evidence.lookback.since}`,
    "",
    `Summary: ${byPriority("Now").length} Now, ${byPriority("Next").length} Next, ${byPriority("Watch").length} Watch.`,
  ];

  for (const priority of ["Now", "Next", "Watch"]) {
    sections.push("", `## ${priority}`);
    const entries = byPriority(priority);
    sections.push(
      entries.length > 0
        ? entries.map(formatFinding).join("\n\n")
        : "No findings in this category.",
    );
  }

  sections.push(
    "",
    renderProcessMetrics(evidence),
    "",
    "## Evidence Boundaries",
    "",
    "This report contains aggregate, privacy-safe maintenance evidence. It does not include secrets, credentials, resolved media URLs, magnets, info hashes, bridge URLs, or raw telemetry payloads.",
  );
  return `${sections.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = { sinceDays: 7, output: null, jsonOutput: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--since-days") {
      args.sinceDays = Number(argv[++index]);
      if (
        !Number.isInteger(args.sinceDays) ||
        args.sinceDays < 1 ||
        args.sinceDays > 365
      ) {
        throw new Error("--since-days must be an integer between 1 and 365");
      }
    } else if (value === "--output") {
      args.output = argv[++index];
    } else if (value === "--json-output") {
      args.jsonOutput = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

function writeOutput(file, content) {
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const evidence = collectEvidence({ sinceDays: args.sinceDays });
  const markdown = renderMarkdown(evidence);
  const json = JSON.stringify(
    { evidence, findings: classifyEvidence(evidence) },
    null,
    2,
  );
  writeOutput(args.output, markdown);
  writeOutput(args.jsonOutput, `${json}\n`);
  if (!args.output) process.stdout.write(markdown);
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
