import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { evaluate, reviewBindings } from "./gauntlet.mjs";
import { createQaRunManifest } from "./qa-run.mjs";

const cases = JSON.parse(
  readFileSync(new URL("../docs/gauntlet/pilot-cases.json", import.meta.url)),
);
const byId = (items, id) => items.find((item) => item.id === id);
const codes = (item) =>
  item.reasons.map((reason) =>
    typeof reason === "string" ? reason : reason.code,
  );
const hasFinding = (result, code) =>
  result.findings.some((finding) => finding.code === code);

function minimal(evidence, requirement = {}) {
  return {
    version: 1,
    task: {
      outcome: "Synthetic focused rule test",
      requirements: [
        {
          id: "required",
          text: "Required execution",
          runId: "run",
          scope: "command",
          evidence: ["proof"],
          ...requirement,
        },
      ],
    },
    runs: [{ id: "run", documents: [] }],
    evidence: [
      { id: "proof", runId: "run", provenance: "synthetic", ...evidence },
    ],
    conclusions: [],
    corrections: [],
    documentRoots: [],
  };
}

function withReceipt(receipt, callback) {
  const root = mkdtempSync(join(tmpdir(), "streamer-gauntlet-"));
  writeFileSync(join(root, "receipt.json"), JSON.stringify(receipt));
  try {
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function observed(overrides = {}) {
  return {
    kind: "observation",
    status: "passed",
    scope: "command",
    source: "Synthetic review regression",
    observedAt: "2026-09-23T08:00:00Z",
    ...overrides,
  };
}

function reviewableInput() {
  const input = minimal(observed({ executionKind: "mocked-handler" }));
  input.candidate = { fingerprint: "candidate-a", files: ["owner.mjs"] };
  input.checkInventory = [
    { id: "focused", status: "passed", executionKind: "mocked-handler" },
    { id: "native", status: "not-run", executionKind: "native-runtime" },
  ];
  input.draft = "Focused tests passed; native execution not run.";
  return input;
}

function completedReview(input, overrides = {}) {
  const bindings = reviewBindings(input);
  return {
    id: "review-a",
    reviewer: { role: "risk_reviewer", context: "fresh", independent: true },
    phase1: {
      recordedAt: "2026-09-26T10:00:00Z",
      bindings: {
        task: bindings.task,
        candidate: bindings.candidate,
        evidence: bindings.evidence,
        checkInventory: bindings.checkInventory,
      },
      assessment: "Compared task, source and evidence before receiving draft.",
    },
    phase2: {
      recordedAt: "2026-09-26T10:01:00Z",
      bindings: { draft: bindings.draft, gauntlet: bindings.gauntlet },
      comparison: "Compared the draft and mechanical Gauntlet result.",
    },
    findings: [],
    dispositions: [],
    ...overrides,
  };
}

test("review: failed scenario contradicts a pass even without required scenario names", () => {
  const input = minimal(observed({ scenarios: { playback: "failed" } }));
  const original = structuredClone(input);
  const result = evaluate(input);
  assert.equal(result.requirements[0].state, "open");
  assert.ok(
    result.requirements[0].reasons.includes("OBSERVATION_CONTRADICTION"),
  );
  assert.deepEqual(input, original);
  assert.equal(result.evidence[0].status, "passed");
  assert.deepEqual(result.evidence[0].scenarios, { playback: "failed" });
});

test("review: absent selector cannot match an absent receipt command", () => {
  withReceipt(
    {
      version: 3,
      kind: "streamer-verification-receipt",
      mode: "focused",
      generatedAt: "2026-09-23T08:00:00Z",
      results: [{ status: 0 }],
      files: [],
    },
    (root) => {
      const result = evaluate(
        minimal({ kind: "verify-change", path: "receipt.json" }),
        { root },
      );
      assert.equal(result.requirements[0].state, "open");
      assert.equal(result.evidence[0].status, "unknown");
      assert.ok(result.requirements[0].reasons.includes("SELECTOR_INVALID"));
    },
  );
});

test("review: known different revisions cannot jointly cover one candidate's scenarios", () => {
  const input = minimal(
    observed({ revision: "revision-A", scenarios: { playback: "passed" } }),
    { evidence: ["proof", "second"], scenarios: ["playback", "cleanup"] },
  );
  input.evidence.push({
    ...input.evidence[0],
    id: "second",
    revision: "revision-B",
    scenarios: { cleanup: "passed" },
  });
  const result = evaluate(input);
  assert.equal(result.requirements[0].state, "open");
  assert.ok(result.requirements[0].reasons.includes("CODE_CONFLICT"));
  assert.deepEqual(
    result.evidence.map(({ status }) => status),
    ["passed", "passed"],
  );
});

test("review: selectors and selected receipt records must be present and unambiguous", () => {
  const base = {
    version: 3,
    kind: "streamer-verification-receipt",
    mode: "focused",
    generatedAt: "2026-09-23T08:00:00Z",
    results: [{ command: "check", status: 0 }],
  };
  for (const selector of [undefined, null, "", " ", 0]) {
    withReceipt(base, (root) => {
      const result = evaluate(
        minimal({ kind: "verify-change", path: "receipt.json", selector }),
        { root },
      );
      assert.equal(result.evidence[0].status, "unknown");
      assert.ok(result.requirements[0].reasons.includes("SELECTOR_INVALID"));
    });
  }
  for (const change of [
    { results: [{ status: 0 }] },
    { results: [{ command: "check" }] },
    { results: [{ command: "check", status: "0" }] },
    { results: [{ command: "check", status: -1 }] },
    {
      results: [
        { command: "check", status: 0 },
        { command: "check", status: 1 },
      ],
    },
    { notRun: [{ command: "check", reason: "stopped-after-failure" }] },
    { results: [], notRun: [{ reason: "stopped-after-failure" }] },
    { results: [], notRun: [{ command: "check" }] },
  ]) {
    withReceipt({ ...base, ...change }, (root) => {
      const result = evaluate(
        minimal({
          kind: "verify-change",
          path: "receipt.json",
          selector: "check",
        }),
        { root },
      );
      assert.equal(result.requirements[0].state, "open");
      assert.equal(result.evidence[0].status, "unknown");
    });
  }
});

test("review: QA selectors and ids follow the same nonempty selection rule", () => {
  for (const [selector, receipt] of [
    [undefined, { steps: [{ status: "passed" }] }],
    ["check", { steps: [{ id: "check", status: "passed" }] }],
    ["check", { runId: "run", steps: [{ id: "check" }] }],
    [
      "check",
      {
        runId: "run",
        steps: [
          { id: "check", status: "passed" },
          { id: "check", status: "failed" },
        ],
      },
    ],
  ]) {
    withReceipt(
      { version: 1, generatedAt: "2026-09-23T08:00:00Z", ...receipt },
      (root) => {
        assert.equal(
          evaluate(
            minimal(
              { kind: "qa-run", path: "receipt.json", selector },
              { scope: "manual" },
            ),
            { root },
          ).requirements[0].state,
          "open",
        );
      },
    );
  }
});

test("review: valid plans and not-run receipts retain their limited status", () => {
  for (const [receipt, expectedStatus] of [
    [{ focusedCommands: ["check"], finalCommands: [] }, "planned"],
    [
      {
        version: 3,
        kind: "streamer-verification-receipt",
        mode: "focused",
        results: [],
        generatedAt: "2026-09-23T08:00:00Z",
        notRun: [{ command: "check", reason: "stopped-after-failure" }],
      },
      "not-run",
    ],
  ]) {
    withReceipt(receipt, (root) => {
      const result = evaluate(
        minimal({
          kind: "verify-change",
          path: "receipt.json",
          selector: "check",
        }),
        { root },
      );
      assert.equal(result.evidence[0].status, expectedStatus);
      assert.equal(result.requirements[0].state, "open");
    });
  }
});

test("review: coherent candidate coverage and separate historical claims stay supported", () => {
  const input = minimal(
    observed({ revision: "A", scenarios: { playback: "passed" } }),
    { evidence: ["proof", "second"], scenarios: ["playback", "cleanup"] },
  );
  input.evidence.push({
    ...input.evidence[0],
    id: "second",
    scenarios: { cleanup: "passed" },
  });
  assert.equal(evaluate(input).requirements[0].state, "supported");
  input.evidence[1].revision = "B";
  input.conclusions = input.evidence.map((e) => ({
    id: e.id,
    text: `Limited historical result at ${e.revision}`,
    runId: "run",
    scope: "command",
    evidence: [e.id],
  }));
  input.conclusions.push({ ...input.task.requirements[0], id: "combined" });
  const result = evaluate(input);
  assert.deepEqual(
    result.conclusions.map(({ state }) => state),
    ["supported", "supported", "review"],
  );
});

test("review: only comparable fingerprints conflict; subsets, order and unknown metadata do not", () => {
  const base = observed({
    revision: "A",
    fingerprint: "1".repeat(64),
    fingerprintAlgorithm: "sha256-path-nul-content-nul-v1",
    files: ["one.mjs", "two.mjs"],
  });
  for (const [overrides, conflict] of [
    [{}, true],
    [{ files: ["subset.mjs"] }, false],
    [{ files: ["two.mjs", "one.mjs"] }, false],
    [{ fingerprintAlgorithm: "another-algorithm" }, false],
    [{ fingerprintAlgorithm: undefined }, false],
    [{ files: undefined }, false],
    [{ files: [] }, false],
    [{ fingerprint: "1".repeat(64) }, false],
  ]) {
    const input = minimal(base, { evidence: ["proof", "second"] });
    input.evidence.push({
      ...input.evidence[0],
      id: "second",
      fingerprint: "2".repeat(64),
      ...overrides,
    });
    const result = evaluate(input);
    assert.equal(
      result.requirements[0].reasons.includes("CODE_CONFLICT"),
      conflict,
    );
    assert.equal(result.requirements[0].state, conflict ? "open" : "supported");
  }
});

test("review: an explicit fingerprint requirement needs comparable metadata, not string equality", () => {
  const base = observed({
    fingerprint: "1".repeat(64),
    fingerprintAlgorithm: "sha256-path-nul-content-nul-v1",
    files: ["one.mjs"],
  });
  for (const [code, reason] of [
    [{ fingerprint: base.fingerprint }, "FINGERPRINT_INCOMPARABLE"],
    [{ ...base, files: ["other.mjs"] }, "FINGERPRINT_INCOMPARABLE"],
    [{ ...base, fingerprint: "2".repeat(64) }, "CODE_MISMATCH"],
    [base, null],
  ]) {
    const result = evaluate(minimal(base, { code }));
    assert.equal(result.requirements[0].state, reason ? "open" : "supported");
    if (reason) assert.ok(result.requirements[0].reasons.includes(reason));
  }
});

test("review: invalid fingerprint identity stays unknown, never a current-file pass", () => {
  const fingerprint = createHash("sha256")
    .update("owner.mjs\0bytes\0owner.mjs\0bytes\0")
    .digest("hex");
  for (const change of [
    { files: ["owner.mjs", "owner.mjs"], fingerprint },
    { fingerprint: undefined },
    { fingerprint: "invalid" },
    { fingerprint: 42 },
  ]) {
    withReceipt(
      {
        version: 3,
        kind: "streamer-verification-receipt",
        mode: "focused",
        generatedAt: "2026-09-23T08:00:00Z",
        results: [{ command: "check", status: 0 }],
        files: ["owner.mjs"],
        ...change,
      },
      (root) => {
        writeFileSync(join(root, "owner.mjs"), "bytes");
        const result = evaluate(
          minimal(
            { kind: "verify-change", path: "receipt.json", selector: "check" },
            { code: { currentFiles: true } },
          ),
          { root },
        );
        assert.equal(result.evidence[0].status, "passed");
        assert.equal(result.evidence[0].currentFingerprint, "unknown");
        assert.equal(result.requirements[0].state, "open");
      },
    );
  }
});

test("new guest claim needs confirmation bound to its own run", () => {
  const result = evaluate(cases);
  assert.equal(byId(result.requirements, "guest-confirmation").state, "open");
  assert.ok(
    codes(byId(result.conclusions, "guest-claim")).includes(
      "NETWORK_CONFIRMATION_NEEDED",
    ),
  );
});

test("local fixture cannot support a broader external-network claim", () => {
  const result = evaluate(cases);
  assert.equal(byId(result.conclusions, "external-claim").state, "review");
  assert.ok(
    codes(byId(result.conclusions, "external-claim")).includes(
      "SCOPE_MISMATCH",
    ),
  );
});

test("exit zero with skipped required scenarios leaves the task requirement open", () => {
  const result = evaluate(cases);
  assert.equal(byId(result.requirements, "required-scenarios").state, "open");
  assert.ok(
    codes(byId(result.requirements, "required-scenarios")).includes(
      "SCENARIOS_NOT_PASSED",
    ),
  );
  assert.deepEqual(byId(result.evidence, "four-skipped").counts, {
    passed: 0,
    failed: 0,
    skipped: 4,
  });
});

test("partial correction marks filename, document, and direct matrix reference", () => {
  const result = evaluate(cases);
  assert.ok(hasFinding(result, "CORRECTION_REVIEW"));
  assert.ok(hasFinding(result, "STALE_LABEL"));
  const affected = result.affected.filter(
    (item) => item.runId === "synthetic-corrected",
  );
  assert.ok(
    affected.some(
      (item) =>
        item.kind === "document" &&
        item.path.endsWith("guest-network-source-coverage.md"),
    ),
  );
  assert.ok(
    affected.some(
      (item) => item.kind === "reference" && item.path.endsWith("QA_MATRIX.md"),
    ),
  );
  assert.ok(
    affected.some(
      (item) => item.kind === "conclusion" && item.id === "partial-correction",
    ),
  );
  assert.ok(
    affected.some(
      (item) => item.kind === "requirement" && item.id === "corrected-context",
    ),
  );
  assert.equal(byId(result.evidence, "corrected-fixture").status, "passed");
});

test("bounded fixture pass needs no network confirmation and retains unknown code identity", () => {
  const result = evaluate(cases);
  const claim = byId(result.conclusions, "bounded-fixture-pass");
  assert.equal(claim.state, "supported");
  assert.ok(!codes(claim).includes("NETWORK_CONFIRMATION_NEEDED"));
  assert.equal(byId(result.requirements, "bounded-fixture").state, "supported");
  assert.equal(byId(result.evidence, "local-five-passed").revision, "unknown");
  assert.ok(hasFinding(result, "CODE_UNKNOWN"));
});

test("guest correction does not relabel the distinct synthetic guest run", () => {
  const result = evaluate(cases);
  assert.equal(
    byId(result.conclusions, "prior-guest-context").state,
    "supported",
  );
  assert.equal(
    result.contexts.find((item) => item.runId === "synthetic-prior-guest")
      .category,
    "guest",
  );
  assert.ok(
    !result.affected.some(
      (item) =>
        item.runId === "synthetic-prior-guest" ||
        item.path?.endsWith("prior-guest-run.md"),
    ),
  );
});

test("evaluation preserves the caller's observations and documents", () => {
  const before = JSON.stringify(cases);
  const path = "docs/gauntlet/fixtures/guest-network-source-coverage.md";
  const contents = readFileSync(path, "utf8");
  evaluate(cases);
  assert.equal(JSON.stringify(cases), before);
  assert.equal(readFileSync(path, "utf8"), contents);
});

test("verify-change plan is not execution even with a sidecar pass label", () => {
  withReceipt(
    {
      files: [],
      rules: ["process"],
      focusedCommands: ["node --test"],
      finalCommands: [],
    },
    (root) => {
      const result = evaluate(
        minimal({
          kind: "verify-change",
          path: "receipt.json",
          status: "passed",
          scope: "command",
        }),
        { root },
      );
      assert.equal(result.requirements[0].state, "open");
      assert.notEqual(result.evidence[0].status, "passed");
    },
  );
});

test("QA manifest playback remains not-run despite passed preflight and sidecar overrides", () => {
  const receipt = createQaRunManifest({
    runId: "run",
    surface: "ui",
    scenario: "playback",
    label: "synthetic",
    revision: "a".repeat(40),
    branch: "synthetic",
    preflight: { status: "passed" },
    now: new Date("2026-09-23T00:00:00Z"),
  });
  withReceipt(receipt, (root) => {
    const result = evaluate(
      minimal(
        {
          kind: "qa-run",
          path: "receipt.json",
          selector: "manual-playback",
          status: "passed",
          scope: "external-network",
        },
        { scope: "manual" },
      ),
      { root },
    );
    assert.equal(result.requirements[0].state, "open");
    assert.equal(result.evidence[0].status, "not-run");
    assert.equal(result.evidence[0].scope, "manual");
  });
});

test("QA preflight cannot be promoted to external-network scope", () => {
  const receipt = createQaRunManifest({
    runId: "run",
    revision: "a".repeat(40),
    branch: "synthetic",
    preflight: { status: "passed" },
  });
  withReceipt(receipt, (root) => {
    const result = evaluate(
      minimal(
        {
          kind: "qa-run",
          path: "receipt.json",
          selector: "runtime-preflight",
          scope: "external-network",
        },
        { scope: "external-network" },
      ),
      { root },
    );
    assert.equal(result.requirements[0].state, "open");
    assert.equal(result.evidence[0].scope, "preflight");
  });
});

test("verification command pass with unknown scenarios cannot satisfy required scenarios", () => {
  withReceipt(
    {
      version: 3,
      kind: "streamer-verification-receipt",
      mode: "focused",
      generatedAt: "2026-09-23T00:00:00Z",
      revision: "a".repeat(40),
      fingerprint: "b".repeat(64),
      files: [],
      results: [{ command: "node --test", status: 0 }],
      notRun: [],
      status: "passed",
    },
    (root) => {
      const result = evaluate(
        minimal(
          {
            kind: "verify-change",
            path: "receipt.json",
            selector: "node --test",
          },
          { scenarios: ["playback"] },
        ),
        { root },
      );
      assert.equal(result.requirements[0].state, "open");
      assert.ok(codes(result.requirements[0]).includes("SCENARIOS_UNKNOWN"));
      assert.equal(result.evidence[0].revision, "a".repeat(40));
      assert.equal(result.evidence[0].fingerprint, "b".repeat(64));
    },
  );
});

test("unrecognized or missing receipt stays unknown instead of inheriting pass", () => {
  for (const receipt of [
    { status: "passed" },
    {
      version: 999,
      kind: "streamer-verification-receipt",
      status: "passed",
      results: [],
    },
  ]) {
    withReceipt(receipt, (root) => {
      const result = evaluate(
        minimal({
          kind: "verify-change",
          path: "receipt.json",
          status: "passed",
        }),
        { root },
      );
      assert.equal(result.requirements[0].state, "open");
      assert.notEqual(result.evidence[0].status, "passed");
    });
  }
});

test("confirmation from a different run is not inherited", () => {
  const input = minimal(
    {
      kind: "observation",
      status: "passed",
      scope: "active-probe",
      source: "Synthetic test",
      observedAt: "2026-09-23T00:00:00Z",
    },
    { scope: "active-probe", network: "home" },
  );
  input.runs[0].context = {
    runId: "previous-run",
    category: "home",
    source: "Previous run user confirmation",
    confirmedAt: "2026-09-22T00:00:00Z",
  };
  const result = evaluate(input);
  assert.ok(
    codes(result.requirements[0]).includes("NETWORK_CONFIRMATION_NEEDED"),
  );
});

test("handwritten pass without source and observation time cannot support a claim", () => {
  const result = evaluate(
    minimal({ kind: "observation", scope: "command", status: "passed" }),
  );
  assert.equal(result.requirements[0].state, "open");
  assert.ok(codes(result.requirements[0]).includes("PROVENANCE_UNKNOWN"));
});

test("honestly disclosed skips support the limited conclusion but leave the requirement open", () => {
  const result = evaluate(cases);
  assert.equal(
    byId(result.conclusions, "skipped-disclosed").state,
    "supported",
  );
  assert.equal(byId(result.requirements, "required-scenarios").state, "open");
});

test("an unresolved correction keeps the document requirement open while preserving the test pass", () => {
  const result = evaluate(cases);
  assert.equal(byId(result.requirements, "corrected-context").state, "open");
  assert.ok(
    codes(byId(result.requirements, "corrected-context")).includes(
      "CORRECTION_REVIEW",
    ),
  );
  assert.equal(byId(result.evidence, "corrected-fixture").status, "passed");
});

test("a current-file mismatch restricts new claims without rewriting the historical pass", () => {
  const fingerprint = createHash("sha256")
    .update("owner.mjs\0original\0")
    .digest("hex");
  const receipt = {
    version: 3,
    kind: "streamer-verification-receipt",
    mode: "focused",
    generatedAt: "2026-09-23T00:00:00Z",
    revision: "a".repeat(40),
    fingerprint,
    files: ["owner.mjs"],
    results: [{ command: "check", status: 0 }],
    notRun: [],
  };
  withReceipt(receipt, (root) => {
    writeFileSync(join(root, "owner.mjs"), "original");
    const input = minimal(
      { kind: "verify-change", path: "receipt.json", selector: "check" },
      { code: { currentFiles: true } },
    );
    assert.equal(evaluate(input, { root }).requirements[0].state, "supported");
    writeFileSync(join(root, "owner.mjs"), "changed");
    const result = evaluate(input, { root });
    assert.equal(result.requirements[0].state, "open");
    assert.equal(result.evidence[0].currentFingerprint, "mismatch");
    assert.equal(result.evidence[0].status, "passed");
  });
});

test("explicit failures override a pass label and malformed counts remain unknown", () => {
  for (const data of [
    { counts: { passed: 2, failed: 1, skipped: 0 } },
    { exitCode: 1 },
    { counts: { passed: "5", failed: 0, skipped: 0 } },
  ]) {
    const input = minimal({
      kind: "observation",
      status: "passed",
      scope: "command",
      source: "synthetic",
      observedAt: "2026-09-23T00:00:00Z",
      ...data,
    });
    assert.equal(evaluate(input).requirements[0].state, "open");
  }
});

test("missing file, run mismatch, missing task, and duplicate ids do not silently pass", () => {
  assert.equal(
    evaluate(minimal({ kind: "qa-run", path: "does-not-exist.json" }))
      .evidence[0].status,
    "unknown",
  );
  const input = minimal({
    kind: "observation",
    status: "passed",
    scope: "command",
    source: "synthetic",
    observedAt: "2026-09-23T00:00:00Z",
    runId: "other",
  });
  assert.ok(evaluate(input).requirements[0].reasons.includes("RUN_MISMATCH"));
  assert.ok(hasFinding(evaluate({ version: 1 }), "TASK_UNKNOWN"));
  input.runs.push({ ...input.runs[0] });
  assert.throws(() => evaluate(input), /Duplicate/);
});

test("a correction without document roots explicitly reports unknown reference coverage", () => {
  const input = structuredClone(cases);
  input.documentRoots = [];
  assert.ok(hasFinding(evaluate(input), "DOCUMENT_SCAN_INCOMPLETE"));
});

test("CLI is advisory on findings, distinguishes malformed input, and emits readable output", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/gauntlet.mjs", "--input", "docs/gauntlet/pilot-cases.json"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Vereiste uitkomst/);
  assert.match(result.stdout, /SCENARIOS_NOT_PASSED/);
  assert.match(result.stdout, /Inhoudelijke beoordeling nodig/);
  assert.equal(
    spawnSync(process.execPath, ["scripts/gauntlet.mjs", "--invalid"], {
      encoding: "utf8",
    }).status,
    2,
  );
});

test("malformed receipt records stay unknown instead of crashing the whole review", () => {
  for (const receipt of [
    null,
    { version: 1, runId: "run", steps: [null] },
    {
      version: 3,
      kind: "streamer-verification-receipt",
      mode: "final",
      results: [null],
    },
  ]) {
    withReceipt(receipt, (root) => {
      const result = evaluate(
        minimal({
          kind: receipt?.version === 1 ? "qa-run" : "verify-change",
          path: "receipt.json",
          selector: "check",
        }),
        { root },
      );
      assert.equal(result.evidence[0].status, "unknown");
      assert.equal(result.requirements[0].state, "open");
    });
  }
});

test("receipt fingerprints use exact bytes, including a binary selected file", () => {
  const bytes = Buffer.from([0xff, 0, 0xfd]);
  const fingerprint = createHash("sha256")
    .update("owner.bin\0")
    .update(bytes)
    .update("\0")
    .digest("hex");
  withReceipt(
    {
      version: 3,
      kind: "streamer-verification-receipt",
      mode: "focused",
      generatedAt: "2026-09-23T00:00:00Z",
      files: ["owner.bin"],
      fingerprint,
      results: [{ command: "check", status: 0 }],
    },
    (root) => {
      writeFileSync(join(root, "owner.bin"), bytes);
      const result = evaluate(
        minimal(
          { kind: "verify-change", path: "receipt.json", selector: "check" },
          { code: { currentFiles: true } },
        ),
        { root },
      );
      assert.equal(result.evidence[0].currentFingerprint, "match");
    },
  );
});

test("a current two-phase independent review with zero findings is executed", () => {
  const input = reviewableInput();
  input.reviews = [completedReview(input)];
  const result = evaluate(input);
  assert.equal(result.review.state, "completed");
  assert.equal(result.review.findings.length, 0);
  assert.equal(result.review.openFindingCount, 0);
  assert.equal(hasFinding(result, "SEMANTIC_REVIEW"), false);
  assert.equal(result.requirements[0].state, "supported");
  assert.equal(result.checkInventory[1].status, "not-run");
});

test("review identity covers task, candidate, loaded evidence, inventory, and draft", () => {
  for (const mutate of [
    (input) => {
      input.task.outcome = "Changed task";
    },
    (input) => {
      input.task.requirements[0].text = "Changed requirement";
    },
    (input) => {
      input.candidate.fingerprint = "candidate-b";
    },
    (input) => {
      input.evidence[0].status = "failed";
    },
    (input) => {
      input.checkInventory[1].status = "passed";
    },
    (input) => {
      input.draft = "Unqualified success.";
    },
    (input) => {
      input.conclusions.push({
        id: "claim",
        runId: "run",
        scope: "command",
        evidence: ["proof"],
      });
    },
  ]) {
    const input = reviewableInput();
    input.reviews = [completedReview(input)];
    mutate(input);
    const result = evaluate(input);
    assert.equal(result.review.state, "stale");
    assert.equal(hasFinding(result, "SEMANTIC_REVIEW"), true);
  }
});

test("phase 1 must be recorded first by an independent reviewer", () => {
  for (const mutate of [
    (review) => {
      review.phase1.recordedAt = review.phase2.recordedAt;
    },
    (review) => {
      review.phase1.assessment = "";
    },
    (review) => {
      review.reviewer.independent = false;
    },
    (review) => {
      review.reviewer.context = "existing";
    },
    (review) => {
      review.reviewer.role = "self-review";
    },
  ]) {
    const input = reviewableInput();
    const review = completedReview(input);
    mutate(review);
    input.reviews = [review];
    assert.equal(evaluate(input).review.state, "incomplete");
    assert.equal(hasFinding(evaluate(input), "SEMANTIC_REVIEW"), true);
  }
});

test("phase 2 cannot supply a missing phase-1 source binding", () => {
  const input = reviewableInput();
  const review = completedReview(input);
  review.phase2.bindings = {
    ...review.phase1.bindings,
    ...review.phase2.bindings,
  };
  delete review.phase1.bindings.evidence;
  input.reviews = [review];
  assert.equal(evaluate(input).review.state, "incomplete");
  assert.equal(hasFinding(evaluate(input), "SEMANTIC_REVIEW"), true);
});

test("completed review and open findings remain separate from project controls", () => {
  const input = reviewableInput();
  input.reviews = [
    completedReview(input, {
      findings: [
        { id: "gap", severity: "P2", text: "Native evidence remains absent." },
      ],
    }),
  ];
  const result = evaluate(input);
  assert.equal(result.review.state, "completed");
  assert.equal(result.review.openFindingCount, 1);
  assert.equal(result.review.findings[0].status, "open");
  assert.equal(result.checkInventory[1].status, "not-run");
  assert.equal(hasFinding(result, "SEMANTIC_REVIEW"), false);
});

test("a subsequent current review retains history and records disposition", () => {
  const input = reviewableInput();
  const first = completedReview(input, {
    findings: [{ id: "gap", severity: "P2", text: "Browser flow missing." }],
  });
  input.candidate.fingerprint = "candidate-b";
  input.evidence[0].executionKind = "browser-interaction";
  input.checkInventory[0].executionKind = "browser-interaction";
  input.repairRounds = [
    { id: "repair-1", fromReviewId: "review-a", retests: ["focused"] },
  ];
  const second = completedReview(input, {
    id: "review-b",
    phase1: {
      ...completedReview(input).phase1,
      recordedAt: "2026-09-26T11:00:00Z",
    },
    phase2: {
      ...completedReview(input).phase2,
      recordedAt: "2026-09-26T11:01:00Z",
    },
    dispositions: [
      {
        reviewId: "review-a",
        findingId: "gap",
        status: "resolved",
        source: "Focused browser retest",
      },
    ],
  });
  input.reviews = [first, second];
  const result = evaluate(input);
  assert.equal(result.review.state, "completed");
  assert.equal(result.review.currentReviewId, "review-b");
  assert.equal(result.reviewHistory.length, 2);
  assert.equal(result.reviewHistory[0].state, "stale");
  assert.equal(result.review.findings[0].status, "resolved");
  assert.equal(result.review.openFindingCount, 0);
  assert.equal(result.review.repairRoundCount, 1);
});

test("a second review-driven repair round is rejected", () => {
  const input = reviewableInput();
  input.repairRounds = [{ id: "one" }, { id: "two" }];
  assert.throws(() => evaluate(input), /repair round/i);
});

test("execution kind prevents a mocked handler from proving browser or device flow", () => {
  const input = minimal(
    observed({
      scope: "local-fixture",
      executionKind: "mocked-handler",
      executionKindSource: "test source",
    }),
    { scope: "local-fixture", expectedExecutionKind: "browser-interaction" },
  );
  const result = evaluate(input);
  assert.equal(result.requirements[0].state, "open");
  assert.ok(result.requirements[0].reasons.includes("EXECUTION_KIND_MISMATCH"));
  input.task.requirements[0].scope = "real-device";
  input.evidence[0].scope = "real-device";
  delete input.task.requirements[0].expectedExecutionKind;
  const broader = evaluate(input);
  assert.equal(broader.requirements[0].state, "open");
  assert.ok(
    broader.requirements[0].reasons.includes("EXECUTION_KIND_CONTRADICTION"),
  );
});

test("a mocked callback cannot be promoted by local-fixture scope alone", () => {
  const input = minimal(
    observed({
      scope: "local-fixture",
      executionKind: "mocked-handler",
      executionKindSource: "component test source",
      labelProvenance: "manual",
    }),
    { scope: "local-fixture" },
  );
  const result = evaluate(input);
  assert.equal(result.requirements[0].state, "open");
  assert.ok(
    result.requirements[0].reasons.includes("EXECUTION_KIND_CONTRADICTION"),
  );
});

test("verify receipt retains measured timing and not-run reason", () => {
  withReceipt(
    {
      version: 3,
      kind: "streamer-verification-receipt",
      mode: "final",
      generatedAt: "2026-09-23T08:00:00Z",
      finishedAt: "2026-09-23T08:00:03Z",
      durationMs: 3000,
      runtime: { node: "v26.7.0", npm: "12.0.2" },
      results: [],
      notRun: [
        {
          command: "check",
          reason: "stopped-after-failure",
          failedCommand: "previous",
        },
      ],
    },
    (root) => {
      const result = evaluate(
        minimal({
          kind: "verify-change",
          path: "receipt.json",
          selector: "check",
        }),
        { root },
      );
      assert.equal(result.evidence[0].status, "not-run");
      assert.equal(result.evidence[0].notRunReason, "stopped-after-failure");
      assert.equal(result.evidence[0].finishedAt, "2026-09-23T08:00:03Z");
      assert.equal(result.evidence[0].receiptDurationMs, 3000);
      assert.deepEqual(result.evidence[0].runtime, {
        node: "v26.7.0",
        npm: "12.0.2",
      });
    },
  );
});
