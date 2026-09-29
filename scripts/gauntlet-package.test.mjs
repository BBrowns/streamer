import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  finishPackage,
  main,
  recordCheckEnd,
  recordCheckStart,
  parseCli,
  startPackage,
} from "./gauntlet-package.mjs";
import { evaluate, reviewBindings } from "./gauntlet.mjs";
import { buildVerificationPlan } from "./verify-change.mjs";

function git(root, ...args) {
  return execFileSync("/usr/bin/git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gauntlet-package-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.email", "tests@example.invalid");
  git(root, "config", "user.name", "Tests");
  const put = (path, value) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  put("a.txt", "HEAD a\n");
  put("b.txt", "HEAD b\n");
  put("unrelated.txt", "keep\n");
  put("UI.md", "Stable UI review context\n");
  put("design/streamer-visual-contract.md", "Typography before containers\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  put(
    "config/verification-map.json",
    JSON.stringify({
      rules: [
        {
          id: "test",
          patterns: [".*"],
          visualImpact: "no",
          focusedCommands: ["focused"],
          finalCommands: ["final"],
        },
      ],
      fallback: {
        id: "fallback",
        visualImpact: "no",
        focusedCommands: [],
        finalCommands: [],
      },
      visualCaseMappings: [],
    }),
  );
  return { root, put };
}

test("start resolves visual unknowns before creating the task candidate", (t) => {
  const { root, put } = fixture(t);
  const mapPath = join(root, "config/verification-map.json");
  const map = read(mapPath);
  map.rules[0].visualImpact = "yes";
  map.visualCaseMappings = [
    { patterns: ["^b\\.txt$"], cases: ["library-phone", "library-desktop"] },
  ];
  put("config/verification-map.json", JSON.stringify(map));

  assert.throws(
    () =>
      startPackage({
        root,
        taskId: "needs-classification",
        files: ["a.txt"],
        task: "Classify before candidate creation",
      }),
    /unresolved/i,
  );
  assert.equal(existsSync(join(root, "artifacts/gauntlet")), false);

  const started = startPackage({
    root,
    taskId: "classified",
    files: ["a.txt"],
    task: "Classify before candidate creation",
    visualImpactResolutions: [
      {
        file: "a.txt",
        impact: "yes",
        cases: ["library-phone", "library-desktop"],
        resolvedBy: "Codex pre-candidate visual-impact triage",
        rationale:
          "This file changes rendered Library layout and has stable phone and desktop cases in the Streamer surface map.",
      },
    ],
  });
  const baseline = read(join(started.runDirectory, "baseline.json"));
  assert.equal(baseline.verificationPlan.visualImpact, "yes");
  assert.deepEqual(baseline.verificationPlan.visualCases, [
    "library-desktop",
    "library-phone",
  ]);
  assert.deepEqual(baseline.verificationPlan.unknownVisualFiles, []);
  assert.deepEqual(baseline.verificationPlan.visualImpactResolutions, [
    {
      file: "a.txt",
      impact: "yes",
      cases: ["library-desktop", "library-phone"],
      resolvedBy: "Codex pre-candidate visual-impact triage",
      rationale:
        "This file changes rendered Library layout and has stable phone and desktop cases in the Streamer surface map.",
    },
  ]);
  assert.deepEqual(
    baseline.verificationPlan.visualImpactByFile.find(
      (item) => item.file === "a.txt",
    ),
    {
      file: "a.txt",
      impact: "yes",
      cases: ["library-desktop", "library-phone"],
      resolvedBy: "Codex pre-candidate visual-impact triage",
      rationale:
        "This file changes rendered Library layout and has stable phone and desktop cases in the Streamer surface map.",
    },
  );
});

test("CLI accepts explicit non-visual resolution metadata before candidate creation", (t) => {
  const { root, put } = fixture(t);
  const mapPath = join(root, "config/verification-map.json");
  const map = read(mapPath);
  map.rules[0].visualImpact = "unknown";
  put("config/verification-map.json", JSON.stringify(map));
  assert.equal(read(mapPath).rules[0].visualImpact, "unknown");
  assert.deepEqual(
    buildVerificationPlan(["a.txt"], read(mapPath)).unknownVisualFiles,
    ["a.txt"],
  );

  const { options } = parseCli([
    "start",
    "--task-id",
    "cli-classification",
    "--task-text",
    "Classify visual impact from the command line",
    "--file",
    "a.txt",
    "--visual-impact",
    "a.txt|no|Codex pre-candidate visual-impact triage|The changed file is a test-only fixture and contains no rendered UI or styles.",
    "--output-root",
    "artifacts/gauntlet",
  ]);
  const { runDirectory } = startPackage({ root, ...options });
  const baseline = read(join(runDirectory, "baseline.json"));
  assert.deepEqual(baseline.verificationPlan.visualImpactResolutions, [
    {
      file: "a.txt",
      impact: "no",
      cases: [],
      resolvedBy: "Codex pre-candidate visual-impact triage",
      rationale:
        "The changed file is a test-only fixture and contains no rendered UI or styles.",
    },
  ]);
  assert.equal(baseline.verificationPlan.visualImpact, "no");
});

test("visual screenshot evidence reuses candidate identity and hashes contract bytes", (t) => {
  const { root, put } = fixture(t);
  const mapPath = join(root, "config/verification-map.json");
  const map = read(mapPath);
  map.visualCaseMappings = [
    { patterns: ["^a\\.txt$"], cases: ["library-desktop", "library-phone"] },
  ];
  put("config/verification-map.json", JSON.stringify(map));
  assert.deepEqual(buildVerificationPlan(["a.txt"], map).visualCases, [
    "library-desktop",
    "library-phone",
  ]);
  const { runDirectory } = startPackage({
    root,
    taskId: "visual-evidence",
    files: ["a.txt"],
    task: "Capture the library visual surfaces",
  });
  assert.deepEqual(
    read(join(runDirectory, "baseline.json")).verificationPlan.visualCases,
    ["library-desktop", "library-phone"],
  );
  const marker = recordCheckStart({
    root,
    runDirectory,
    attemptId: "visual-browser",
  });
  const screenshot = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII=",
    "base64",
  );
  put("visual/library.png", screenshot);
  const startTime = new Date(Date.parse(marker.recordedAt) + 1).toISOString();
  put(
    "visual/results.json",
    JSON.stringify({
      stats: { startTime, duration: 1 },
      suites: [
        {
          title: "visual-regression",
          specs: [
            {
              title: "library capture",
              tests: [
                {
                  projectName: "phone-web",
                  status: "expected",
                  expectedStatus: "passed",
                  results: [
                    {
                      status: "passed",
                      duration: 1,
                      startTime: new Date(
                        Date.parse(startTime) + 1,
                      ).toISOString(),
                      attachments: [
                        {
                          name: "gauntlet-visual:library-phone:dark:390x844",
                          contentType: "image/png",
                          path: "visual/library.png",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  recordCheckEnd({ root, runDirectory, attemptId: "visual-browser" });

  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    playwrightReports: [
      { path: "visual/results.json", attemptId: "visual-browser" },
    ],
  });

  assert.deepEqual(pkg.verificationPlan.visualCases, [
    "library-desktop",
    "library-phone",
  ]);
  assert.equal(
    pkg.visualContractVersion.algorithm,
    "sha256-path-nul-content-nul-v1",
  );
  assert.deepEqual(
    pkg.visualContractVersion.files.map((file) => file.path),
    ["UI.md", "design/streamer-visual-contract.md"],
  );
  const expectedContractHash = createHash("sha256")
    .update("UI.md\0Stable UI review context\n\0")
    .update(
      "design/streamer-visual-contract.md\0Typography before containers\n\0",
    )
    .digest("hex");
  assert.equal(pkg.visualContractVersion.sha256, expectedContractHash);
  const evidence = pkg.gauntletInput.evidence.find(
    (item) => item.kind === "visual-screenshot",
  );
  assert.equal(evidence.captureContext.caseId, "library-phone");
  assert.equal(evidence.captureContext.viewport.width, 390);
  assert.equal(evidence.markerBinding, "paired");
  assert.equal(evidence.candidateBinding, "current");
  assert.equal(
    evidence.candidateIdentity.fingerprint,
    pkg.candidate.fingerprint,
  );
  assert.equal(
    evidence.screenshotHash,
    createHash("sha256").update(screenshot).digest("hex"),
  );
  assert.equal(
    pkg.gauntletInput.visualReview.contractVersion.sha256,
    expectedContractHash,
  );
  assert.equal(
    evidence.captureContext.capturedAt,
    new Date(Date.parse(startTime) + 2).toISOString(),
  );
  assert.deepEqual(pkg.gauntletInput.visualImpact, {
    status: "yes",
    cases: ["library-desktop", "library-phone"],
    resolutions: [],
  });
});

function read(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function receipt(
  root,
  path,
  { files = ["a.txt"], fingerprint, generatedAt, finishedAt } = {},
) {
  const hash = createHash("sha256");
  for (const file of files)
    hash
      .update(file)
      .update("\0")
      .update(readFileSync(join(root, file)))
      .update("\0");
  const value = {
    version: 3,
    kind: "streamer-verification-receipt",
    mode: "focused",
    files,
    revision: git(root, "rev-parse", "HEAD"),
    fingerprint: fingerprint ?? hash.digest("hex"),
    generatedAt: generatedAt ?? new Date().toISOString(),
    finishedAt: finishedAt ?? new Date().toISOString(),
    focusedCommands: ["focused"],
    finalCommands: ["final"],
    results: [{ command: "focused", status: 0, durationMs: 12 }],
    notRun: [],
    status: "passed",
  };
  writeFileSync(join(root, path), JSON.stringify(value));
  return value;
}

function startVisualRun(root, put) {
  const map = read(join(root, "config/verification-map.json"));
  map.rules[0].visualImpact = "yes";
  map.visualCaseMappings = [
    { patterns: ["^a\\.txt$"], cases: ["library-phone"] },
  ];
  put("config/verification-map.json", JSON.stringify(map));
  return startPackage({
    root,
    taskId: "bounded-visual-repair",
    files: ["a.txt"],
    task: {
      request: "Review and repair the Library phone surface once",
      requirements: [
        {
          id: "focused-requirement",
          text: "Focused verification is recorded.",
          runId: "bounded-visual-repair",
          scope: "command",
          evidence: ["verify-1"],
        },
      ],
    },
  }).runDirectory;
}

function captureVisual(root, runDirectory, attemptId) {
  const marker = recordCheckStart({ root, runDirectory, attemptId });
  const screenshot = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ioAAAAASUVORK5CYII=",
    "base64",
  );
  const screenshotPath = `visual/${attemptId}.png`;
  mkdirSync(join(root, "visual"), { recursive: true });
  writeFileSync(join(root, screenshotPath), screenshot);
  const startTime = new Date(Date.parse(marker.recordedAt) + 1).toISOString();
  const reportPath = `visual/${attemptId}.json`;
  writeFileSync(
    join(root, reportPath),
    JSON.stringify({
      stats: { startTime, duration: 1 },
      suites: [
        {
          title: "visual-regression",
          specs: [
            {
              title: "library capture",
              tests: [
                {
                  projectName: "phone-web",
                  status: "expected",
                  expectedStatus: "passed",
                  results: [
                    {
                      status: "passed",
                      duration: 1,
                      startTime: new Date(
                        Date.parse(startTime) + 1,
                      ).toISOString(),
                      attachments: [
                        {
                          name: "gauntlet-visual:library-phone:dark:390x844",
                          contentType: "image/png",
                          path: screenshotPath,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  recordCheckEnd({ root, runDirectory, attemptId });
  return reportPath;
}

function attachCurrentVisualP1Review(root, pkg, gauntletInputPath) {
  const input = pkg.gauntletInput;
  const bindings = reviewBindings(input, { root });
  const risk = {
    id: `risk-${input.candidate.fingerprint.slice(0, 8)}`,
    reviewer: {
      role: "risk_reviewer",
      context: "fresh",
      independent: true,
    },
    phase1: {
      recordedAt: "2026-09-29T10:00:00Z",
      bindings: {
        task: bindings.task,
        candidate: bindings.candidate,
        evidence: bindings.evidence,
        checkInventory: bindings.checkInventory,
      },
      assessment: "Reviewed source and evidence before the delivery draft.",
    },
    phase2: {
      recordedAt: "2026-09-29T10:01:00Z",
      bindings: { draft: bindings.draft, gauntlet: bindings.gauntlet },
      comparison: "Compared the delivery claims with the candidate evidence.",
    },
    findings: [
      {
        id: "candidate-risk-p1",
        severity: "P1",
        text: "The repair limit must span package attempts.",
      },
    ],
  };
  const screenshot = input.evidence.find(
    (item) => item.kind === "visual-screenshot",
  );
  const visual = {
    id: `visual-${input.candidate.fingerprint.slice(0, 8)}`,
    reviewer: {
      role: "visual_reviewer",
      context: "fresh",
      independent: true,
    },
    phase1: {
      recordedAt: "2026-09-29T10:02:00Z",
      bindings: {
        task: bindings.task,
        candidate: bindings.candidate,
        evidence: bindings.evidence,
        checkInventory: bindings.checkInventory,
        visualContract: bindings.visualContract,
        visualCases: bindings.visualCases,
      },
      assessment: "Compared the bound screenshot with the visual contract.",
    },
    phase2: {
      recordedAt: "2026-09-29T10:03:00Z",
      bindings: { draft: bindings.draft, gauntlet: bindings.gauntlet },
      comparison: "Compared the finding with the bounded delivery.",
    },
    visual: {
      contractVersion: input.visualReview.contractVersion.sha256,
      cases: [...input.visualImpact.cases],
    },
    findings: [
      {
        id: "library-density-p1",
        severity: "P1",
        category: "density",
        location: "Library phone results",
        observation: "Secondary metadata competes with titles.",
        violatedPrinciple: "Typography before containers.",
        smallestAppropriateRepair: "Reduce secondary metadata contrast.",
        evidenceReference: { screenshotId: screenshot.id },
      },
    ],
  };
  input.reviews = [risk, visual];
  const report = evaluate(input, { root });
  assert.equal(report.review.state, "completed");
  writeFileSync(gauntletInputPath, `${JSON.stringify(input, null, 2)}\n`);
}

test("visual P1 repair is recorded and cannot create a second repair candidate", (t) => {
  const { root: fixtureRoot, put } = fixture(t);
  const root = realpathSync(fixtureRoot);
  const runDirectory = startVisualRun(root, put);
  const firstReport = captureVisual(root, runDirectory, "visual-before-repair");
  const first = finishPackage({
    root,
    runDirectory,
    playwrightReports: [
      { path: firstReport, attemptId: "visual-before-repair" },
    ],
    draft: "Initial candidate with a visual P1 finding.",
  });
  attachCurrentVisualP1Review(root, first.package, first.gauntletInputPath);

  put("a.txt", "first bounded visual repair\n");
  const repairReport = captureVisual(root, runDirectory, "visual-repair-1");
  const repaired = finishPackage({
    root,
    runDirectory,
    playwrightReports: [
      { path: repairReport, attemptId: "visual-repair-1" },
    ],
    draft: "Candidate after the single bounded repair.",
  });
  assert.deepEqual(repaired.package.gauntletInput.repairRounds, [
    {
      id: "repair-1",
      fromReviewId: `risk-${first.package.candidate.fingerprint.slice(0, 8)}`,
      fromReviewIds: [
        `risk-${first.package.candidate.fingerprint.slice(0, 8)}`,
        `visual-${first.package.candidate.fingerprint.slice(0, 8)}`,
      ],
      findingIds: ["candidate-risk-p1", "library-density-p1"],
      retests: ["library-phone", "playwright-1-1", "verify-1", "verify-2"],
    },
  ]);

  put("a.txt", "second repair must be blocked\n");
  assert.throws(
    () => finishPackage({ root, runDirectory }),
    /one.*repair|repair.*round/i,
  );
  assert.equal(readdirSync(join(runDirectory, "packages")).length, 2);
});

test("scopes candidate to task changes after a dirty baseline, including new and deleted files", (t) => {
  const { root, put } = fixture(t);
  put("a.txt", "pre-existing dirty\n");
  put("unrelated.txt", "unrelated dirty\n");
  const { runDirectory } = startPackage({
    root,
    taskId: "candidate",
    files: ["a.txt", "b.txt", "new.txt"],
    task: "Change selected files",
  });
  put("a.txt", "task version\n");
  rmSync(join(root, "b.txt"));
  put("new.txt", "new content\n");
  const { packagePath, package: pkg } = finishPackage({ root, runDirectory });
  assert.ok(read(packagePath));
  const phase1 = read(join(dirname(packagePath), "phase1-bindings.json"));
  const expected = reviewBindings(pkg.gauntletInput, { root });
  assert.deepEqual(phase1.bindings, {
    task: expected.task,
    candidate: expected.candidate,
    evidence: expected.evidence,
    checkInventory: expected.checkInventory,
  });
  assert.equal(phase1.bindings.draft, undefined);
  assert.equal(phase1.bindings.gauntlet, undefined);
  assert.deepEqual(pkg.candidate.changedFiles, ["a.txt", "b.txt", "new.txt"]);
  assert.equal(
    pkg.candidate.files.find((x) => x.path === "b.txt").state,
    "deleted",
  );
  assert.equal(
    pkg.candidate.files.find((x) => x.path === "new.txt").state,
    "added",
  );
  assert.equal(
    pkg.candidate.files.find((x) => x.path === "a.txt").baseline.sha256,
    createHash("sha256").update("pre-existing dirty\n").digest("hex"),
  );
  assert.equal(
    readFileSync(join(root, "unrelated.txt"), "utf8"),
    "unrelated dirty\n",
  );
  const diff = readFileSync(
    join(dirname(packagePath), "candidate.diff"),
    "utf8",
  );
  assert.match(diff, /task version/);
  assert.match(diff, /new content/);
  assert.match(diff, /-HEAD b/);
  assert.doesNotMatch(diff, /unrelated dirty/);
});

test("retains complete focused and final plan, missing evidence, and bound receipt attempts", (t) => {
  const { root } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "checks",
    files: ["a.txt"],
    task: "Check a",
  });
  receipt(root, "receipt.json");
  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    receipts: ["receipt.json"],
    requiredChecks: [
      {
        id: "native-back",
        text: "Native Back",
        expectedExecutionKind: "native-runtime",
      },
    ],
  });
  const focused = pkg.checkInventory.find((x) => x.command === "focused");
  const final = pkg.checkInventory.find((x) => x.command === "final");
  const native = pkg.checkInventory.find((x) => x.id === "native-back");
  assert.deepEqual(focused.planStages, ["focused"]);
  assert.equal(focused.status, "passed");
  assert.equal(focused.attempts[0].codeChangedDuringControl, "unknown");
  assert.equal(final.status, "not-run");
  assert.deepEqual(final.planStages, ["final"]);
  assert.equal(native.status, "not-run");
  assert.equal(native.expectedExecutionKind, "native-runtime");
  assert.equal(native.requiredScope, null);
  assert.equal(pkg.gauntletInput.task.requirements[0].scope, "unknown");
  assert.ok(pkg.missingEvidence.some((x) => x.checkId === native.id));
  assert.equal(focused.executionKind, "command-only");
  assert.equal(focused.scope, "command");
  assert.equal(pkg.metrics.preparation.durationMs, null);
  assert.ok(pkg.metrics.preparation.packageDurationMs >= 0);
  assert.equal(pkg.metrics.review.durationMs, null);
  assert.equal(pkg.metrics.repair.usage, null);
  assert.equal(
    pkg.gauntletInput.evidence.find((x) => x.id === focused.id).executionKind,
    "command-only",
  );
});

test("detects changed files between check markers and does not call old receipt current", (t) => {
  const { root, put } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "changing",
    files: ["a.txt"],
    task: "Change a",
  });
  recordCheckStart({ root, runDirectory, attemptId: "focused-1" });
  receipt(root, "receipt.json");
  put("a.txt", "changed after test\n");
  recordCheckEnd({ root, runDirectory, attemptId: "focused-1" });
  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    receipts: [{ path: "receipt.json", attemptId: "focused-1" }],
  });
  const attempt = pkg.checkInventory.find((x) => x.command === "focused")
    .attempts[0];
  assert.equal(attempt.codeChangedDuringControl, true);
  assert.equal(attempt.matchesCandidate, false);
  assert.equal(pkg.candidate.checksMatchCandidate, false);
});

test("CLI receipt attempt ids attach start and end markers", (t) => {
  const { root } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "cli-markers",
    files: ["a.txt"],
    task: "Check a",
  });
  recordCheckStart({ root, runDirectory, attemptId: "focused-1" });
  receipt(root, "receipt.json");
  recordCheckEnd({ root, runDirectory, attemptId: "focused-1" });
  const previousDirectory = process.cwd();
  process.chdir(root);
  try {
    main([
      "finish",
      "--run",
      runDirectory,
      "--receipt",
      "receipt.json",
      "--receipt-attempt-id",
      "focused-1",
    ]);
  } finally {
    process.chdir(previousDirectory);
  }
  const pkg = read(
    join(runDirectory, "packages", "attempt-001", "package.json"),
  );
  const attempt = pkg.checkInventory.find((x) => x.command === "focused")
    .attempts[0];
  assert.equal(attempt.markerBinding, "paired");
  assert.equal(attempt.codeChangedDuringControl, false);
  assert.equal(attempt.matchesCandidate, true);
});

test("CLI required checks link exact commands and expose unknown commands", (t) => {
  const { root } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "cli-required",
    files: ["a.txt"],
    task: "Check the focused command",
  });
  recordCheckStart({ root, runDirectory, attemptId: "focused-1" });
  receipt(root, "receipt.json");
  recordCheckEnd({ root, runDirectory, attemptId: "focused-1" });
  const previousDirectory = process.cwd();
  process.chdir(root);
  try {
    main([
      "finish",
      "--run",
      runDirectory,
      "--receipt",
      "receipt.json",
      "--receipt-attempt-id",
      "focused-1",
      "--required-check",
      "focused",
      "--required-check",
      "unknown-command",
    ]);
  } finally {
    process.chdir(previousDirectory);
  }
  const pkg = read(
    join(runDirectory, "packages", "attempt-001", "package.json"),
  );
  const focused = pkg.checkInventory.find((row) => row.command === "focused");
  const unknown = pkg.checkInventory.find(
    (row) => row.command === "unknown-command",
  );
  assert.equal(focused.required, true);
  assert.equal(focused.status, "passed");
  assert.equal(unknown.status, "not-run");
  assert.equal(unknown.requirementLink, "unlinked");
  assert.ok(
    pkg.missingEvidence.some(
      (item) =>
        item.checkId === unknown.id &&
        item.reason === "required-check-unlinked",
    ),
  );
  const result = evaluate(pkg.gauntletInput, { root });
  assert.equal(
    result.requirements.find((item) => item.id === focused.id).state,
    "supported",
  );
  assert.equal(
    result.requirements.find((item) => item.id === unknown.id).state,
    "open",
  );
});

test("old or malformed receipt times cannot bind to later check markers", (t) => {
  const { root } = fixture(t);
  for (const [name, times, relation] of [
    [
      "historical",
      () => ({
        generatedAt: "2020-01-01T00:00:00Z",
        finishedAt: "2020-01-01T00:00:01Z",
      }),
      "historical",
    ],
    [
      "missing",
      () => ({ generatedAt: undefined, finishedAt: undefined }),
      "invalid",
    ],
    [
      "reversed",
      () => ({
        generatedAt: "2030-01-01T00:00:01Z",
        finishedAt: "2030-01-01T00:00:00Z",
      }),
      "invalid",
    ],
    [
      "malformed",
      () => ({ generatedAt: "not-a-date", finishedAt: "not-a-date" }),
      "invalid",
    ],
    [
      "before-start",
      ({ start }) => ({
        generatedAt: new Date(
          Date.parse(start.recordedAt) - 1000,
        ).toISOString(),
        finishedAt: start.recordedAt,
      }),
      "outside-markers",
    ],
    [
      "after-end",
      ({ end }) => ({
        generatedAt: end.recordedAt,
        finishedAt: new Date(Date.parse(end.recordedAt) + 1000).toISOString(),
      }),
      "outside-markers",
    ],
  ]) {
    const { runDirectory } = startPackage({
      root,
      taskId: `receipt-${name}`,
      files: ["a.txt"],
      task: "Check current a",
    });
    const start = recordCheckStart({
      root,
      runDirectory,
      attemptId: "focused-1",
    });
    const data = receipt(root, `${name}.json`);
    const end = recordCheckEnd({ root, runDirectory, attemptId: "focused-1" });
    writeFileSync(
      join(root, `${name}.json`),
      JSON.stringify({ ...data, ...times({ start, end }) }),
    );
    const { package: pkg } = finishPackage({
      root,
      runDirectory,
      receipts: [{ path: `${name}.json`, attemptId: "focused-1" }],
      requiredChecks: [
        {
          id: "required-focused",
          command: "focused",
          text: "Current focused check",
          scope: "command",
        },
      ],
    });
    const attempt = pkg.checkInventory.find((row) => row.command === "focused")
      .attempts[0];
    assert.equal(attempt.status, "passed");
    assert.notEqual(attempt.markerBinding, "paired");
    assert.equal(attempt.receiptTimeRelation, relation);
    assert.equal(attempt.codeChangedDuringControl, "unknown");
    assert.equal(pkg.candidate.checksMatchCandidate, "unknown");
    assert.equal(
      evaluate(pkg.gauntletInput, { root }).requirements[0].state,
      "open",
    );
  }
});

test("a receipt for a candidate subset never proves all selected files", (t) => {
  const { root } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "subset",
    files: ["a.txt", "b.txt"],
    task: "Check both files",
  });
  recordCheckStart({ root, runDirectory, attemptId: "focused-1" });
  receipt(root, "receipt.json", { files: ["a.txt"] });
  recordCheckEnd({ root, runDirectory, attemptId: "focused-1" });
  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    receipts: [{ path: "receipt.json", attemptId: "focused-1" }],
  });
  const attempt = pkg.checkInventory.find((x) => x.command === "focused")
    .attempts[0];
  assert.equal(attempt.matchesCandidate, false);
  assert.equal(pkg.candidate.checksMatchCandidate, false);
});

test("an unavailable receipt revision leaves candidate identity unknown", (t) => {
  const { root } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "unknown-revision",
    files: ["a.txt"],
    task: "Check a",
  });
  recordCheckStart({ root, runDirectory, attemptId: "focused-1" });
  const data = receipt(root, "receipt.json");
  writeFileSync(
    join(root, "receipt.json"),
    JSON.stringify({ ...data, revision: "unknown" }),
  );
  recordCheckEnd({ root, runDirectory, attemptId: "focused-1" });
  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    receipts: [{ path: "receipt.json", attemptId: "focused-1" }],
  });
  const attempt = pkg.checkInventory.find((x) => x.command === "focused")
    .attempts[0];
  assert.equal(attempt.matchesCandidate, "unknown");
  assert.equal(pkg.candidate.checksMatchCandidate, "unknown");
});

test("older receipt attempts remain visible without replacing the latest candidate match", (t) => {
  const { root, put } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "later-attempt",
    files: ["a.txt"],
    task: "Check final a",
  });
  recordCheckStart({ root, runDirectory, attemptId: "old" });
  receipt(root, "old.json");
  recordCheckEnd({ root, runDirectory, attemptId: "old" });
  put("a.txt", "final candidate\n");
  recordCheckStart({ root, runDirectory, attemptId: "final" });
  receipt(root, "final.json");
  recordCheckEnd({ root, runDirectory, attemptId: "final" });
  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    receipts: [
      { path: "old.json", attemptId: "old" },
      { path: "final.json", attemptId: "final" },
    ],
  });
  const attempts = pkg.checkInventory.find(
    (x) => x.command === "focused",
  ).attempts;
  assert.deepEqual(
    attempts.map((attempt) => attempt.matchesCandidate),
    [false, true],
  );
  assert.equal(pkg.candidate.checksMatchCandidate, true);
});

test("keeps every package attempt and copied receipt immutable", (t) => {
  const { root, put } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "history",
    files: ["a.txt"],
    task: "History",
  });
  receipt(root, "receipt.json");
  const first = finishPackage({
    root,
    runDirectory,
    receipts: ["receipt.json"],
  });
  const original = readFileSync(first.packagePath);
  put("a.txt", "later candidate\n");
  const second = finishPackage({
    root,
    runDirectory,
    receipts: ["receipt.json"],
  });
  assert.notEqual(first.packagePath, second.packagePath);
  assert.deepEqual(readFileSync(first.packagePath), original);
  assert.equal(readdirSync(join(runDirectory, "packages")).length, 2);
  assert.notEqual(
    first.package.candidate.fingerprint,
    second.package.candidate.fingerprint,
  );
});

test("generated Gauntlet input accepts task-derived checks and QA run identity", (t) => {
  const { root } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "integration",
    files: ["a.txt"],
    task: "Verify Player source choice",
  });
  writeFileSync(
    join(root, "qa.json"),
    JSON.stringify({
      version: 1,
      runId: "qa-specific",
      generatedAt: new Date().toISOString(),
      repository: { revision: git(root, "rev-parse", "HEAD") },
      steps: [{ id: "manual-playback", status: "not-run" }],
    }),
  );
  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    qaRuns: ["qa.json"],
    requiredChecks: [
      {
        id: "qa-qa-specific-manual-playback",
        text: "Real playback",
        expectedExecutionKind: "native-runtime",
      },
    ],
    draft: "Native playback remains untested",
  });
  const input = pkg.gauntletInput;
  assert.ok(Array.isArray(input.repairRounds));
  assert.equal(input.task.requirements.length, 1);
  assert.equal(
    input.task.requirements[0].expectedExecutionKind,
    "native-runtime",
  );
  assert.ok(input.runs.some((run) => run.id === "qa-specific"));
  assert.equal(
    input.evidence.find((item) => item.id === "qa-qa-specific-manual-playback")
      .runId,
    "qa-specific",
  );
  const report = evaluate(input, { root });
  assert.equal(report.review.state, "not-run");
  assert.equal(report.requirements[0].state, "open");
  assert.ok(
    report.findings.every((finding) => finding.code !== "TASK_UNKNOWN"),
  );
});

test("rejects paths outside the repository and keeps an outside symlink untouched", (t) => {
  const { root } = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "gauntlet-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "secret.txt"), "private\n");
  symlinkSync(outside, join(root, "linked"));
  assert.throws(
    () =>
      startPackage({
        root,
        taskId: "outside",
        files: [join(outside, "secret.txt")],
        task: "Read a",
      }),
    /outside repository/,
  );
  assert.throws(
    () =>
      startPackage({
        root,
        taskId: "linked",
        files: ["linked/secret.txt"],
        task: "Read a",
      }),
    /Symlink path/,
  );
  assert.throws(
    () =>
      startPackage({
        root,
        taskId: "outside",
        files: ["a.txt"],
        task: "Read a",
        outputRoot: "unrelated-output",
      }),
    /artifacts\/gauntlet/,
  );
});

test("CLI refuses task text files outside the repository", (t) => {
  const outside = mkdtempSync(join(tmpdir(), "gauntlet-task-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const taskPath = join(outside, "task.md");
  writeFileSync(taskPath, "A private task\n");
  assert.throws(
    () =>
      main([
        "start",
        "--task-id",
        "outside",
        "--file",
        "AGENTS.md",
        "--task-file",
        taskPath,
      ]),
    /outside repository/,
  );
});

test("imports Playwright statuses without copying unrelated raw report fields", (t) => {
  const { root } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "browser",
    files: ["a.txt"],
    task: "Exercise browser choice",
  });
  const report = {
    stats: { expected: 1, skipped: 1, unexpected: 0, duration: 123 },
    metadata: { resolvedUrl: "magnet:?xt=private" },
    suites: [
      {
        title: "flow.spec.ts",
        specs: [
          {
            title: "click chooser",
            tests: [
              {
                projectName: "phone-web",
                status: "expected",
                expectedStatus: "passed",
                results: [{ status: "passed", duration: 12 }],
              },
            ],
          },
          {
            title: "native Back",
            tests: [
              {
                projectName: "phone-web",
                status: "skipped",
                expectedStatus: "skipped",
                results: [],
              },
            ],
          },
        ],
      },
    ],
  };
  writeFileSync(join(root, "playwright.json"), JSON.stringify(report));
  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    playwrightReports: ["playwright.json"],
  });
  const checks = pkg.checkInventory.filter(
    (row) => row.sourceKind === "playwright-json",
  );
  assert.deepEqual(
    checks.map((row) => row.status),
    ["passed", "skipped"],
  );
  assert.ok(checks.every((row) => row.scope === undefined));
  assert.ok(
    pkg.gauntletInput.evidence
      .filter((item) => item.id.startsWith("playwright-"))
      .every((item) => item.scope === "unknown"),
  );
  const copied = readFileSync(
    join(
      root,
      pkg.evidenceSources.find((source) => source.kind === "playwright-json")
        .path,
    ),
    "utf8",
  );
  assert.doesNotMatch(copied, /magnet:|resolvedUrl/);
});

test("source-backed browser annotation carries local fixture scope into Gauntlet", (t) => {
  const { root } = fixture(t);
  const { runDirectory } = startPackage({
    root,
    taskId: "browser-scope",
    files: ["a.txt"],
    task: "Exercise local browser choice",
  });
  writeFileSync(
    join(root, "playwright.json"),
    JSON.stringify({
      stats: { expected: 1, skipped: 0, unexpected: 0 },
      suites: [
        {
          title: "flow.spec.ts",
          specs: [
            {
              title: "click chooser",
              tests: [
                {
                  projectName: "phone-web",
                  status: "expected",
                  expectedStatus: "passed",
                  results: [{ status: "passed", duration: 12 }],
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  const { package: pkg } = finishPackage({
    root,
    runDirectory,
    playwrightReports: ["playwright.json"],
    annotations: {
      "playwright-1-1": {
        executionKind: "browser-interaction",
        scope: "local-fixture",
        source: "flow.spec.ts clicks chooser using local route fixtures",
      },
    },
    requiredChecks: [
      {
        id: "playwright-1-1",
        text: "Browser chooser interaction",
        scope: "local-fixture",
        expectedExecutionKind: "browser-interaction",
        source: "task-derived",
      },
    ],
  });
  const row = pkg.checkInventory.find((x) => x.id === "playwright-1-1");
  const evidence = pkg.gauntletInput.evidence.find((x) => x.id === row.id);
  assert.equal(row.executionKind, "browser-interaction");
  assert.equal(row.scope, "local-fixture");
  assert.equal(evidence.scope, "local-fixture");
  assert.equal(pkg.gauntletInput.task.requirements[0].scope, "local-fixture");
  assert.equal(
    evaluate(pkg.gauntletInput, { root }).requirements[0].state,
    "supported",
  );
});
