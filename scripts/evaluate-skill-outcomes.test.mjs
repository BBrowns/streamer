import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  neutralizeToolRouting,
  parseOutcomeArguments,
  runOutcomeEvaluation,
  validateOutcomeConfiguration,
} from "./evaluate-skill-outcomes.mjs";

test("neutralizes every repository-skill routing section but preserves project rules", () => {
  const source = `# Agents

## Tool Routing

- Use streamer-example.

## Development Cycle

- Verify with streamer-example.

## Project Rules

Preserve this rule.
`;
  const neutralized = neutralizeToolRouting(source);
  assert.equal(neutralized.includes("streamer-example"), false);
  assert.ok(neutralized.includes("## Tool Routing"));
  assert.ok(neutralized.includes("## Development Cycle"));
  assert.ok(neutralized.includes("Preserve this rule."));
});

test("parses bounded on-demand evaluation options", () => {
  assert.deepEqual(
    parseOutcomeArguments([
      "--model",
      "gpt-test",
      "--case",
      "contract",
      "--runs",
      "2",
      "--output-dir",
      "artifacts/eval",
    ]),
    {
      model: "gpt-test",
      caseIds: ["contract"],
      runs: 2,
      outputDir: "artifacts/eval",
    },
  );
  assert.throws(() => parseOutcomeArguments(["--runs", "0"]), /positive/);
});

test("rejects unsafe or incomplete outcome case definitions", () => {
  const root = mkdtempSync(join(tmpdir(), "streamer-outcome-config-"));
  try {
    const errors = validateOutcomeConfiguration(
      {
        version: 1,
        cases: [
          {
            id: "duplicate",
            fixture: "missing",
            prompt: "",
            expectedSkill: "unknown",
            allowedChanges: [],
            verifyCommand: "",
          },
          {
            id: "duplicate",
            fixture: "missing",
            prompt: "Prompt",
            expectedSkill: "known",
            allowedChanges: ["src/file.mjs"],
            verifyCommand: "node --test acceptance.test.mjs",
          },
        ],
      },
      { repoRoot: root, knownSkills: ["known"] },
    );

    assert.ok(errors.some((error) => error.includes("duplicate id")));
    assert.ok(errors.some((error) => error.includes("unknown skill")));
    assert.ok(errors.some((error) => error.includes("missing fixture")));
    assert.ok(errors.some((error) => error.includes("missing prompt")));
    assert.ok(errors.some((error) => error.includes("allowedChanges")));
    assert.ok(errors.some((error) => error.includes("verifyCommand")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const withLibrary of [false, true]) {
  test(`runs isolated variants ${withLibrary ? "with" : "without"} a portable skill library`, () => {
    const root = mkdtempSync(join(tmpdir(), "streamer-outcome-eval-"));
    try {
      const fixture = join(
        root,
        ".agents",
        "evals",
        "skills",
        "fixtures",
        "case",
      );
      const skill = join(root, ".agents", "skills", "streamer-example");
      const library = join(root, ".agents", "skill-library", "example");
      const outputDir = join(root, "results");
      mkdirSync(fixture, { recursive: true });
      mkdirSync(skill, { recursive: true });
      writeFileSync(
        join(root, "AGENTS.md"),
        "# Agents\n\n## Tool Routing\n\n- Use streamer-example.\n\n## Development Cycle\n\n- Verify with streamer-example.\n\n## Project Rules\n\nStay scoped.\n",
      );
      writeFileSync(
        join(skill, "SKILL.md"),
        "---\nname: streamer-example\ndescription: Example.\n---\n\n# Example\n" +
          (withLibrary
            ? "\n[Portable workflow](../../skill-library/example/SKILL.md)\n"
            : ""),
      );
      if (withLibrary) {
        mkdirSync(join(library, "references"), { recursive: true });
        writeFileSync(
          join(library, "SKILL.md"),
          "# Example workflow\n\n[Checklist](references/checklist.md)\n",
        );
        writeFileSync(
          join(library, "references", "checklist.md"),
          "Portable checklist\n",
        );
      }
      writeFileSync(join(fixture, "starting.txt"), "unchanged\n");
      writeFileSync(
        join(fixture, "acceptance.test.mjs"),
        'import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import test from "node:test"; test("solution", () => assert.equal(readFileSync("solution.txt", "utf8"), "done\\n"));\n',
      );
      const casesPath = join(
        root,
        ".agents",
        "evals",
        "skills",
        "outcome-cases.json",
      );
      writeFileSync(
        casesPath,
        JSON.stringify({
          version: 1,
          cases: [
            {
              id: "case",
              fixture: "case",
              prompt: "Create solution.txt containing done.",
              expectedSkill: "streamer-example",
              allowedChanges: ["solution.txt"],
              verifyCommand: "node --test acceptance.test.mjs",
            },
          ],
        }),
      );

      const fakeCodex = join(root, "fake-codex.mjs");
      writeFileSync(
        fakeCodex,
        `#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("fake-codex 1.0.0");
  process.exit(0);
}
const workspace = args[args.indexOf("-C") + 1];
const finalPath = args[args.indexOf("--output-last-message") + 1];
const skills = join(workspace, ".agents", "skills");
const library = join(workspace, ".agents", "skill-library");
if (process.env.CODEX_EVAL_VARIANT === "enabled") {
  const wrapperPath = join(skills, "streamer-example", "SKILL.md");
  const wrapper = readFileSync(wrapperPath, "utf8");
  assert.equal(existsSync(library), ${withLibrary});
  if (${withLibrary}) {
    const workflowLink = wrapper.match(/\\[Portable workflow\\]\\(([^)]+)\\)/)[1];
    const workflowPath = resolve(dirname(wrapperPath), workflowLink);
    const workflow = readFileSync(workflowPath, "utf8");
    const checklistLink = workflow.match(/\\[Checklist\\]\\(([^)]+)\\)/)[1];
    const checklist = readFileSync(resolve(dirname(workflowPath), checklistLink), "utf8");
    assert.ok(checklist.startsWith("Portable checklist\\n"));
  }
} else {
  assert.equal(process.env.CODEX_EVAL_VARIANT, "disabled");
  assert.equal(existsSync(skills), false);
  assert.equal(existsSync(library), false);
}
writeFileSync(join(workspace, "solution.txt"), "done\\n");
writeFileSync(finalPath, "Ran node --test acceptance.test.mjs.\\n");
console.log(JSON.stringify({ type: "command", command: "node --test acceptance.test.mjs" }));
console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } }));
`,
      );
      chmodSync(fakeCodex, 0o755);

      const report = runOutcomeEvaluation(
        {
          model: "gpt-test",
          caseIds: [],
          runs: 1,
          outputDir,
        },
        { repoRoot: root, casesPath, codexCommand: fakeCodex },
      );

      assert.equal(report.version, 1);
      assert.equal(report.runs.length, 2);
      assert.deepEqual(
        report.runs.map((entry) => entry.variant),
        ["enabled", "disabled"],
      );
      for (const entry of report.runs) {
        assert.equal(
          entry.codexStatus,
          0,
          readFileSync(
            join(outputDir, "case", entry.variant, "run-1", "codex.stderr.txt"),
            "utf8",
          ),
        );
      }
      assert.ok(report.runs.every((entry) => entry.acceptance.passed));
      assert.ok(
        report.runs.every((entry) => entry.scopeViolations.length === 0),
      );
      assert.ok(report.runs.every((entry) => entry.verificationObserved));
      assert.deepEqual(report.summary, {
        enabledPassed: 1,
        disabledPassed: 1,
        enabledScopeViolations: 0,
        disabledScopeViolations: 0,
      });
      assert.deepEqual(
        JSON.parse(readFileSync(join(outputDir, "report.json"), "utf8")),
        report,
      );
      if (withLibrary) {
        writeFileSync(
          join(library, "references", "checklist.md"),
          "Portable checklist\nUpdated guidance.\n",
        );
        const updated = runOutcomeEvaluation(
          { model: "gpt-test", caseIds: [], runs: 1, outputDir },
          { repoRoot: root, casesPath, codexCommand: fakeCodex },
        );
        assert.notEqual(
          updated.evaluationSurfaceFingerprint,
          report.evaluationSurfaceFingerprint,
        );
        assert.ok(updated.runs.every((entry) => entry.passed));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
