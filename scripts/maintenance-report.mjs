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

  if ((remote.ci?.failures ?? 0) > 0) {
    addFinding(findings, {
      priority: "Now",
      key: "ci-failures",
      title: "Recent required CI runs failed",
      evidence: `${remote.ci.failures} failed run(s) in the selected lookback.`,
      owner: "Change owner of the failing workflow",
      nextAction:
        "Open the latest failing run and repair the first reproducible failure.",
      closeWhen:
        "A fresh run passes all required jobs without bypassing a gate.",
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

  if ((remote.ci?.cancelled ?? 0) > 0) {
    addFinding(findings, {
      priority: "Next",
      key: "cancelled-ci",
      title: "CI runs were cancelled in the lookback",
      evidence: `${remote.ci.cancelled} cancelled run(s) were observed.`,
      owner: "Delivery maintainer",
      nextAction:
        "Confirm cancellations are superseded PR runs and not timeout or capacity symptoms.",
      closeWhen:
        "Cancellations are explained or the workflow no longer cancels unexpectedly.",
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
