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
  assert.doesNotMatch(report, /secret-looking|magnet:|infoHash|token=/i);
});
