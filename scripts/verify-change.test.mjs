import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildVerificationPlan,
  main,
  parseArguments,
  resolveVisualImpact,
  runVerificationPlan,
} from "./verify-change.mjs";

test("verification planning returns stable cases for known visual impact", () => {
  const plan = buildVerificationPlan(["apps/mobile/app/(tabs)/library.tsx"], {
    rules: [
      {
        id: "mobile-ui",
        patterns: ["^apps/mobile/"],
        visualImpact: "yes",
        focusedCommands: [],
        finalCommands: [],
      },
    ],
    fallback: {
      id: "fallback",
      visualImpact: "unknown",
      focusedCommands: [],
      finalCommands: [],
    },
    visualCaseMappings: [
      {
        patterns: ["^apps/mobile/app/\\(tabs\\)/library\\.tsx$"],
        cases: ["library-phone", "library-desktop"],
      },
    ],
  });

  assert.equal(plan.visualImpact, "yes");
  assert.deepEqual(plan.visualCases, ["library-desktop", "library-phone"]);
  assert.deepEqual(plan.visualImpactByFile, [
    {
      file: "apps/mobile/app/(tabs)/library.tsx",
      impact: "yes",
      cases: ["library-desktop", "library-phone"],
    },
  ]);
  assert.deepEqual(plan.unknownVisualFiles, []);
});

test("verification planning keeps unclassified visual impact explicit", () => {
  const plan = buildVerificationPlan(
    ["apps/mobile/components/shared/UnmappedWidget.tsx"],
    {
      rules: [
        {
          id: "mobile-ui",
          patterns: ["^apps/mobile/"],
          visualImpact: "yes",
          focusedCommands: [],
          finalCommands: [],
        },
      ],
      fallback: {
        id: "fallback",
        visualImpact: "unknown",
        focusedCommands: [],
        finalCommands: [],
      },
      visualCaseMappings: [],
    },
  );

  assert.equal(plan.visualImpact, "unknown");
  assert.deepEqual(plan.visualCases, []);
  assert.deepEqual(plan.unknownVisualFiles, [
    "apps/mobile/components/shared/UnmappedWidget.tsx",
  ]);
  assert.throws(() => resolveVisualImpact(plan), /classif/i);
  assert.throws(
    () =>
      resolveVisualImpact(plan, [
        {
          file: "apps/mobile/components/shared/UnmappedWidget.tsx",
          impact: "no",
        },
      ]),
    /resolvedBy.*rationale/i,
  );
  assert.deepEqual(
    resolveVisualImpact(plan, [
      {
        file: "apps/mobile/components/shared/UnmappedWidget.tsx",
        impact: "no",
        resolvedBy: "Codex pre-candidate visual-impact triage",
        rationale:
          "The changed module owns test-only presentation data and does not render UI or styles.",
      },
    ]),
    {
      visualImpact: "no",
      visualCases: [],
      visualImpactByFile: [
        {
          file: "apps/mobile/components/shared/UnmappedWidget.tsx",
          impact: "no",
          cases: [],
          resolvedBy: "Codex pre-candidate visual-impact triage",
          rationale:
            "The changed module owns test-only presentation data and does not render UI or styles.",
        },
      ],
      unknownVisualFiles: [],
      visualImpactResolutions: [
        {
          file: "apps/mobile/components/shared/UnmappedWidget.tsx",
          impact: "no",
          cases: [],
          resolvedBy: "Codex pre-candidate visual-impact triage",
          rationale:
            "The changed module owns test-only presentation data and does not render UI or styles.",
        },
      ],
    },
  );
});

test("process changes select process checks without release gates", () => {
  const plan = buildVerificationPlan([
    ".codex/hooks/runtime_policy.py",
    ".agents/skills/streamer-verification/SKILL.md",
    "scripts/validate-skill-evals.mjs",
  ]);

  assert.deepEqual(plan.rules, ["process"]);
  assert.deepEqual(plan.focusedCommands, [
    "npm run process:check",
    "npm run process:check:test",
    "npm run dev:runtime:test",
    "npm run hooks:runtime:test",
  ]);
  assert.deepEqual(plan.finalCommands, []);
  assert.equal(plan.visualImpact, "no");
});

test("the Streamer surface map returns stable library cases", () => {
  const plan = buildVerificationPlan(["apps/mobile/app/(tabs)/library.tsx"]);

  assert.equal(plan.visualImpact, "yes");
  assert.deepEqual(plan.visualCases, ["library-desktop", "library-phone"]);
  assert.deepEqual(plan.unknownVisualFiles, []);
});

test("golden-path test infrastructure does not imply UI visual impact", () => {
  const plan = buildVerificationPlan([
    "tests/golden-path/ui-test-helpers.ts",
    "tests/golden-path/visual-regression.spec.ts",
  ]);

  assert.deepEqual(plan.rules, ["golden-path-test-support"]);
  assert.equal(plan.visualImpact, "no");
  assert.deepEqual(plan.visualCases, []);
  assert.deepEqual(plan.focusedCommands, ["npm run test:golden-path"]);
});

test("outcome evaluator changes stay on the focused process path", () => {
  const plan = buildVerificationPlan([
    "scripts/evaluate-skill-outcomes.mjs",
    "scripts/evaluate-skill-outcomes.test.mjs",
  ]);

  assert.deepEqual(plan.rules, ["process"]);
  assert.ok(plan.focusedCommands.includes("npm run process:check:test"));
  assert.deepEqual(plan.finalCommands, []);
});

test("shared contract changes select consumers and cross-workspace verification", () => {
  const plan = buildVerificationPlan([
    "packages/shared/src/schemas/playback.schema.ts",
  ]);

  assert.deepEqual(plan.rules, ["shared-contract"]);
  assert.ok(
    plan.focusedCommands.includes("npm run test --workspace=@streamer/shared"),
  );
  assert.ok(plan.focusedCommands.includes("npm run typecheck:all"));
  assert.deepEqual(plan.finalCommands, ["npm run verify:quick"]);
  assert.equal(plan.visualImpact, "no");
});

test("mobile UI changes select interaction and visual evidence", () => {
  const plan = buildVerificationPlan([
    "apps/mobile/components/player/PlayerControls.tsx",
  ]);

  assert.deepEqual(plan.rules, ["mobile-ui", "mobile"]);
  assert.ok(
    plan.focusedCommands.includes("npm run test --workspace=apps/mobile"),
  );
  assert.ok(plan.focusedCommands.includes("npm run test:golden-path"));
  assert.ok(plan.focusedCommands.includes("npm run test:visual"));
  assert.deepEqual(plan.finalCommands, ["npm run verify:quick"]);
  assert.equal(plan.visualImpact, "yes");
  assert.deepEqual(plan.visualCases, ["player-desktop", "player-phone"]);
});

test("workspace manifests keep workspace and dependency security checks", () => {
  const plan = buildVerificationPlan(["apps/mobile/package.json"]);

  assert.deepEqual(plan.rules, ["mobile", "dependency"]);
  assert.ok(
    plan.focusedCommands.includes("npm run test --workspace=apps/mobile"),
  );
  assert.ok(plan.focusedCommands.includes("npm run security:install-scripts"));
  assert.ok(plan.focusedCommands.includes("npm run security:audit"));
});

test("docs-only changes stay on the light verification path", () => {
  const plan = buildVerificationPlan(["docs/QA_RUNBOOK.md"]);

  assert.deepEqual(plan.rules, ["documentation"]);
  assert.deepEqual(plan.focusedCommands, ["npm run format:check"]);
  assert.deepEqual(plan.finalCommands, []);
});

test("release tooling changes execute the release gate", () => {
  const plan = buildVerificationPlan(["scripts/release-gate.mjs"]);

  assert.deepEqual(plan.rules, ["release-tooling"]);
  assert.deepEqual(plan.focusedCommands, ["npm run release:gate"]);
  assert.deepEqual(plan.finalCommands, ["npm run verify:quick"]);
});

test("mixed plans keep the repository fallback for every unmapped file", () => {
  const plan = buildVerificationPlan([
    "AGENTS.md",
    "scripts/unmapped-runtime-helper.mjs",
  ]);

  assert.deepEqual(plan.rules, ["process", "repository-code"]);
  assert.ok(plan.focusedCommands.includes("npm run process:check"));
  assert.ok(plan.focusedCommands.includes("npm run verify:quick"));
});

test("explicit files and JSON output can be selected from the CLI", () => {
  assert.deepEqual(
    parseArguments([
      "--plan",
      "--json",
      "--files",
      "server/src/index.ts,packages/shared/src/index.ts",
    ]),
    {
      mode: "plan",
      json: true,
      files: ["packages/shared/src/index.ts", "server/src/index.ts"],
      base: null,
      output: null,
    },
  );
});

test("explicit output paths are parsed without changing stdout mode", () => {
  assert.deepEqual(
    parseArguments(["--final", "--output", "tmp/receipt.json"]),
    {
      mode: "final",
      json: false,
      files: [],
      base: null,
      output: "tmp/receipt.json",
    },
  );
});

test("execution stops after the first failed command and records evidence", () => {
  const calls = [];
  const receipt = runVerificationPlan(
    {
      files: ["scripts/example.mjs"],
      rules: ["process"],
      focusedCommands: ["first", "second", "third"],
      finalCommands: [],
    },
    "focused",
    (command) => {
      calls.push(command);
      return { status: command === "second" ? 1 : 0, signal: null };
    },
  );

  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(receipt.version, 3);
  assert.equal(receipt.kind, "streamer-verification-receipt");
  assert.equal(receipt.mode, "focused");
  assert.match(receipt.verificationMapFingerprint, /^[a-f0-9]{64}$/);
  assert.match(receipt.runtime.node, /^v\d+/);
  assert.equal(typeof receipt.runtime.npm, "string");
  assert.equal(typeof receipt.runtime.platform, "string");
  assert.equal(typeof receipt.durationMs, "number");
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.notRun[0].reason, "stopped-after-failure");
  assert.deepEqual(
    receipt.results.map(({ command, status }) => ({ command, status })),
    [
      { command: "first", status: 0 },
      { command: "second", status: 1 },
    ],
  );
});

test("writes a failed receipt atomically before returning a failing status", () => {
  const directory = mkdtempSync(join(tmpdir(), "streamer-receipt-"));
  const output = join(directory, "nested", "receipt.json");
  try {
    const status = main(
      ["--focused", "--file", ".agents/example.md", "--output", output],
      {
        runner: () => ({ status: 1, signal: null }),
        writeStdout: () => {},
      },
    );

    assert.equal(status, 1);
    assert.equal(existsSync(`${output}.tmp`), false);
    const receipt = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(receipt.version, 3);
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.results.length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("records an explicit not-run reason for every command after a failure", () => {
  const receipt = runVerificationPlan(
    {
      files: ["scripts/example.mjs"],
      rules: ["process"],
      focusedCommands: ["first", "second", "third"],
      finalCommands: [],
    },
    "focused",
    (command) => ({ status: command === "first" ? 1 : 0, signal: null }),
  );

  assert.deepEqual(receipt.notRun, [
    {
      command: "second",
      reason: "stopped-after-failure",
      failedCommand: "first",
    },
    {
      command: "third",
      reason: "stopped-after-failure",
      failedCommand: "first",
    },
  ]);
});
