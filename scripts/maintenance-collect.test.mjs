import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

import {
  parseRemote,
  parseActionPins,
  summarizeAudit,
  summarizeOutdated,
  summarizeOpenPullRequests,
  summarizeCiJobs,
  compareRequiredCheckContexts,
  extractRequiredCheckContexts,
  getOpenPullRequestHeadShas,
  summarizeWorkflowRuns,
} from "./maintenance-collect.mjs";

test("rejects remotes with credentials or non-GitHub API path components", () => {
  assert.equal(
    parseRemote("https://user:secret@github.com/owner/repo.git"),
    null,
  );
  assert.equal(parseRemote("https://github.com/owner/repo.git"), "owner/repo");
  assert.equal(parseRemote("git@github.com:owner/repo.git"), "owner/repo");
});

test("summarizes audit severities without exposing advisory details", () => {
  const summary = summarizeAudit({
    vulnerabilities: {
      one: { severity: "high", via: [{ title: "secret-looking detail" }] },
      two: { severity: "moderate", via: [] },
    },
  });

  assert.deepEqual(summary, {
    available: true,
    total: 2,
    counts: { critical: 0, high: 1, moderate: 1, low: 0, info: 0 },
  });
  assert.equal(JSON.stringify(summary).includes("secret-looking"), false);
});

test("summarizes outdated packages with bounded version data", () => {
  const summary = summarizeOutdated({
    "package-a": { current: "1.0.0", wanted: "1.1.0", latest: "2.0.0" },
  });

  assert.deepEqual(summary, {
    available: true,
    count: 1,
    packages: [
      { name: "package-a", current: "1.0.0", wanted: "1.1.0", latest: "2.0.0" },
    ],
    truncated: false,
  });
});

test("summarizes workflow failures, cancellations, queue time, and active state", () => {
  assert.deepEqual(
    summarizeWorkflowRuns(
      {
        workflow_runs: [
          {
            workflow_id: 1,
            head_branch: "feature-success",
            head_sha: "success-sha",
            conclusion: "success",
            created_at: "2026-09-14T09:55:00Z",
            run_started_at: "2026-09-14T10:00:00Z",
            updated_at: "2026-09-14T10:05:00Z",
          },
          {
            workflow_id: 1,
            head_branch: "feature-cancelled",
            head_sha: "cancelled-sha",
            conclusion: "cancelled",
            created_at: "2026-09-14T10:05:00Z",
            run_started_at: "2026-09-14T10:10:00Z",
            updated_at: "2026-09-14T10:12:00Z",
          },
          {
            workflow_id: 1,
            head_branch: "feature-failure",
            head_sha: "failure-sha",
            conclusion: "failure",
            created_at: "2026-09-14T10:15:00Z",
            run_started_at: "2026-09-14T10:20:00Z",
            updated_at: "2026-09-14T10:30:00Z",
          },
        ],
      },
      {
        openPullRequestHeadShas: [
          "success-sha",
          "cancelled-sha",
          "failure-sha",
        ],
        protectedBranches: ["main"],
      },
    ),
    {
      runs: 3,
      failures: 1,
      cancelled: 1,
      activeFailures: 1,
      historicalFailures: 0,
      activeCancelled: 1,
      historicalCancelled: 0,
      reruns: 0,
      queueSeconds: { sampled: 3, median: 300 },
      durationSeconds: { sampled: 3, median: 300 },
    },
  );
});

test("classifies superseded and closed pull request failures as historical", () => {
  const summary = summarizeWorkflowRuns(
    {
      workflow_runs: [
        {
          workflow_id: 9,
          head_branch: "feature",
          head_sha: "open-sha",
          conclusion: "failure",
          created_at: "2026-09-14T09:00:00Z",
          run_started_at: "2026-09-14T09:01:00Z",
          updated_at: "2026-09-14T09:02:00Z",
        },
        {
          workflow_id: 9,
          head_branch: "feature",
          head_sha: "open-sha",
          conclusion: "success",
          created_at: "2026-09-14T09:03:00Z",
          run_started_at: "2026-09-14T09:04:00Z",
          updated_at: "2026-09-14T09:05:00Z",
          run_attempt: 2,
        },
        {
          workflow_id: 9,
          head_branch: "feature",
          head_sha: "open-sha",
          conclusion: "failure",
          created_at: "2026-09-14T09:06:00Z",
          run_started_at: "2026-09-14T09:07:00Z",
          updated_at: "2026-09-14T09:08:00Z",
        },
        {
          workflow_id: 9,
          head_branch: "closed-feature",
          head_sha: "closed-sha",
          conclusion: "failure",
          created_at: "2026-09-14T09:09:00Z",
          run_started_at: "2026-09-14T09:10:00Z",
          updated_at: "2026-09-14T09:11:00Z",
        },
        {
          workflow_id: 9,
          head_branch: "master",
          head_sha: "old-master-sha",
          conclusion: "cancelled",
          created_at: "2026-09-14T09:12:00Z",
          run_started_at: "2026-09-14T09:13:00Z",
          updated_at: "2026-09-14T09:14:00Z",
        },
        {
          workflow_id: 9,
          head_branch: "master",
          head_sha: "new-master-sha",
          conclusion: "success",
          created_at: "2026-09-14T09:15:00Z",
          run_started_at: "2026-09-14T09:16:00Z",
          updated_at: "2026-09-14T09:17:00Z",
        },
      ],
    },
    { openPullRequestHeadShas: ["open-sha"], protectedBranches: ["master"] },
  );

  assert.equal(summary.failures, 3);
  assert.equal(summary.activeFailures, 1);
  assert.equal(summary.historicalFailures, 2);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.activeCancelled, 0);
  assert.equal(summary.historicalCancelled, 1);
  assert.equal(summary.reruns, 1);
});

test("summarizes preflight outcomes and skipped downstream jobs", () => {
  assert.deepEqual(
    summarizeCiJobs({
      jobs: [
        { name: "Dependency Install Preflight", conclusion: "failure" },
        { name: "Lint & Type Check", conclusion: "skipped" },
        { name: "Server Tests", conclusion: "skipped" },
        { name: "workflow-lint", conclusion: "success" },
        { name: "Release Gate", conclusion: "failure" },
      ],
    }),
    {
      runs: 1,
      failures: 1,
      cancelled: 0,
      skippedAfterFailure: 2,
    },
  );
});

test("extracts and compares required check contexts without exposing ruleset payloads", () => {
  const ruleset = {
    rules: [
      {
        type: "required_status_checks",
        parameters: {
          required_status_checks: [
            { context: "Release Gate" },
            { context: "Release Gate" },
            { context: "CodeQL" },
            { context: "Unexpected Check" },
          ],
        },
      },
    ],
  };

  assert.deepEqual(extractRequiredCheckContexts(ruleset), [
    "Release Gate",
    "Release Gate",
    "CodeQL",
    "Unexpected Check",
  ]);
  assert.deepEqual(
    compareRequiredCheckContexts(
      ["Release Gate", "Review Dependency Changes", "CodeQL"],
      extractRequiredCheckContexts(ruleset),
    ),
    {
      available: true,
      missing: ["Review Dependency Changes"],
      unexpected: ["Unexpected Check"],
      duplicate: ["Release Gate"],
    },
  );
});

test("summarizes open pull requests without branch or body details", () => {
  assert.deepEqual(
    summarizeOpenPullRequests([
      { draft: false, user: { login: "dependabot[bot]" } },
      { draft: true, user: { login: "contributor" } },
    ]),
    { available: true, open: 2, drafts: 1, dependabot: 1 },
  );
});

test("extracts only open pull request head SHAs for run correlation", () => {
  assert.deepEqual(
    getOpenPullRequestHeadShas([
      {
        head: { sha: "abc123" },
        headRefName: "feature/secret-name",
        body: "private description",
      },
      { head: { sha: "abc123" } },
      { head: {} },
    ]),
    ["abc123"],
  );
});

test("detects tag-pinned workflow actions", () => {
  const root = mkdtempSync(join(process.cwd(), ".maintenance-test-"));
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github", "workflows", "actions.yml"),
      [
        "steps:",
        "  - uses: actions/checkout@v4",
        "  - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
        "",
      ].join("\\n"),
    );
    const result = parseActionPins(root);
    assert.equal(result.workflowCount, 1);
    assert.equal(result.unpinnedCount, 1);
    assert.equal(result.unpinned[0].action, "actions/checkout");
    assert.ok(result.actionCount > 0);
    assert.ok(
      result.unpinned.every((entry) => !entry.action.includes("secret")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("detects folded YAML action references", () => {
  const root = mkdtempSync(join(process.cwd(), ".maintenance-test-"));
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github", "workflows", "folded.yml"),
      "steps:\n  - uses: >-\n      actions/checkout@v4\n",
    );
    const result = parseActionPins(root);
    assert.equal(result.actionCount, 1);
    assert.equal(result.unpinnedCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
