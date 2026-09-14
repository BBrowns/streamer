import assert from "node:assert/strict";
import test from "node:test";
import { classifyEvidence, renderMarkdown } from "./maintenance-report.mjs";

function evidence(overrides = {}) {
  return {
    generatedAt: "2026-08-11T00:00:00.000Z",
    lookback: { days: 7, since: "2026-08-04T00:00:00.000Z" },
    repository: { repository: "BBrowns/streamer", commit: "abc123" },
    local: {
      audit: { counts: { critical: 0, high: 0 } },
      auditPolicy: { available: true, passed: true },
      exceptions: { expired: [], expiring: [] },
      workflows: { unpinnedCount: 0, actionCount: 12 },
      outdated: { count: 0 },
    },
    remote: {
      available: true,
      ci: { failures: 0, cancelled: 0 },
      codeql: { open: 0, bySeverity: {} },
      dependabot: { open: 0, bySeverity: {} },
    },
    ...overrides,
  };
}

test("classifies blocking production and security signals as Now", () => {
  const findings = classifyEvidence(
    evidence({
      local: {
        audit: { counts: { critical: 1, high: 0 } },
        auditPolicy: { available: true, passed: false },
        exceptions: { expired: [], expiring: [] },
        workflows: { unpinnedCount: 0, actionCount: 12 },
        outdated: { count: 0 },
      },
      remote: {
        available: true,
        ci: { failures: 0, cancelled: 0 },
        codeql: { open: 1, bySeverity: { high: 1 } },
        dependabot: { open: 0, bySeverity: {} },
      },
    }),
  );

  assert.deepEqual(
    findings.map(({ key, priority }) => ({ key, priority })),
    [
      { key: "codeql-alerts", priority: "Now" },
      { key: "local-production-audit", priority: "Now" },
    ],
  );
});

test("renders bounded evidence and omits raw source details", () => {
  const report = renderMarkdown(
    evidence({
      remote: {
        available: false,
        reason: "GitHub API unavailable",
        ci: { failures: 0, cancelled: 0 },
        codeql: { open: 0, bySeverity: {} },
        dependabot: { open: 0, bySeverity: {} },
      },
    }),
  );

  assert.match(report, /GitHub evidence was unavailable/);
  assert.match(report, /privacy-safe maintenance evidence/);
  assert.match(report, /## Process Metrics/);
  assert.doesNotMatch(report, /secret-looking|magnet:|infoHash|token=/i);
});

test("renders aggregate pull request and CI metrics", () => {
  const report = renderMarkdown(
    evidence({
      remote: {
        available: true,
        prs: { available: true, open: 2, drafts: 1, dependabot: 1 },
        ci: {
          runs: 4,
          failures: 1,
          cancelled: 2,
          activeFailures: 1,
          historicalFailures: 0,
          activeCancelled: 0,
          historicalCancelled: 2,
          reruns: 1,
          queueSeconds: { sampled: 4, median: 60 },
          durationSeconds: { sampled: 3, median: 420 },
          preflight: {
            available: true,
            sampledRuns: 2,
            runs: 2,
            failures: 1,
            cancelled: 0,
            skippedAfterFailure: 3,
          },
        },
        codeql: { open: 0, bySeverity: {} },
        dependabot: { open: 0, bySeverity: {} },
      },
    }),
  );

  assert.match(report, /Open PRs: 2/);
  assert.match(report, /Draft PRs: 1/);
  assert.match(report, /Dependabot PRs: 1/);
  assert.match(report, /Active CI failures: 1/);
  assert.match(report, /Historical CI failures: 0/);
  assert.match(report, /Median CI queue time \(sampled runs\): 60s/);
  assert.match(report, /Preflight job sample: 2 CI run\(s\)/);
  assert.match(report, /Preflight runs: 2; failures: 1; cancellations: 0/);
  assert.match(report, /Downstream jobs skipped after preflight failure: 3/);
  assert.match(report, /Median CI duration \(sampled runs\): 420s/);
});

test("keeps historical CI failures out of Now findings", () => {
  const findings = classifyEvidence(
    evidence({
      remote: {
        available: true,
        prs: { available: true, open: 0, drafts: 0, dependabot: 0 },
        ci: {
          runs: 4,
          failures: 4,
          cancelled: 2,
          activeFailures: 0,
          historicalFailures: 4,
          activeCancelled: 0,
          historicalCancelled: 2,
        },
        codeql: { open: 0, bySeverity: {} },
        dependabot: { open: 0, bySeverity: {} },
      },
    }),
  );

  assert.deepEqual(
    findings
      .filter(({ key }) => key.includes("ci"))
      .map(({ key, priority }) => ({ key, priority })),
    [
      { key: "historical-ci-cancellations", priority: "Watch" },
      { key: "historical-ci-failures", priority: "Watch" },
    ],
  );
});

test("reports required-check drift as a current gate finding", () => {
  const findings = classifyEvidence(
    evidence({
      remote: {
        available: true,
        ci: { failures: 0, cancelled: 0 },
        rulesets: {
          contract: {
            available: true,
            missing: ["Review Dependency Changes"],
            unexpected: ["Unexpected Check"],
            duplicate: [],
          },
        },
        codeql: { open: 0, bySeverity: {} },
        dependabot: { open: 0, bySeverity: {} },
      },
    }),
  );

  assert.deepEqual(
    findings
      .filter(({ key }) => key === "required-check-drift")
      .map(({ key, priority }) => ({ key, priority })),
    [{ key: "required-check-drift", priority: "Now" }],
  );
});

test("reports raw findings as Watch when the project policy reviews them", () => {
  const findings = classifyEvidence(
    evidence({
      local: {
        audit: { counts: { critical: 0, high: 2 } },
        auditPolicy: { available: true, passed: true },
        exceptions: { expired: [], expiring: [] },
        workflows: { unpinnedCount: 0, actionCount: 12 },
        outdated: { count: 0 },
      },
    }),
  );

  assert.deepEqual(
    findings.map(({ key, priority }) => ({ key, priority })),
    [{ key: "reviewed-audit-exceptions", priority: "Watch" }],
  );
});
