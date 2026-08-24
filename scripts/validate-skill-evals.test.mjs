import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  activationSurfaceFingerprint,
  validateObservedActivations,
  validateSkillEvalData,
  validateSkillEvals,
} from "./validate-skill-evals.mjs";

test("activation fingerprints include scenario inputs", () => {
  const root = mkdtempSync(join(tmpdir(), "streamer-skill-eval-"));
  try {
    mkdirSync(join(root, ".agents", "skills", "streamer-example"), {
      recursive: true,
    });
    mkdirSync(join(root, ".agents", "evals", "skills"), { recursive: true });
    writeFileSync(
      join(root, "AGENTS.md"),
      "## Tool Routing\n\n- Use streamer-example.\n\n## Validation\n",
    );
    writeFileSync(
      join(root, ".agents", "skills", "streamer-example", "SKILL.md"),
      "---\nname: streamer-example\ndescription: Example.\n---\n",
    );
    const cases = join(
      root,
      ".agents",
      "evals",
      "skills",
      "activation-cases.jsonl",
    );
    writeFileSync(cases, '{"id":"one","prompt":"Before"}\n');
    const before = activationSurfaceFingerprint(root, ["streamer-example"]);
    writeFileSync(cases, '{"id":"one","prompt":"After"}\n');

    assert.notEqual(
      activationSurfaceFingerprint(root, ["streamer-example"]),
      before,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository skill registry and activation cases are valid", () => {
  assert.deepEqual(validateSkillEvals(), []);
});

test("rejects contradictory and unknown activation rules", () => {
  const cases = [
    {
      id: "case",
      prompt: "Example",
      reason: "Exercise malformed routing.",
      mustActivate: ["known"],
      mayActivate: ["unknown"],
      mustNotActivate: ["known"],
    },
    {
      id: "negative",
      prompt: "No skill",
      reason: "Exercise a negative case.",
      mustActivate: [],
      mayActivate: [],
      mustNotActivate: ["known"],
    },
  ];
  const registry = {
    skills: {
      known: {
        owner: "Owner",
        purpose: "Purpose",
        evidence: "Evidence",
        removalCriteria: "Removal condition",
        evalCases: ["case"],
      },
    },
  };

  assert.deepEqual(validateSkillEvalData(cases, registry, ["known"]), [
    "skill eval case: unknown skill unknown",
    "skill eval case: known is both allowed and forbidden",
  ]);
});

test("rejects stale or unexpected observed activation results", () => {
  const cases = [
    {
      id: "case",
      mustActivate: ["required"],
      mayActivate: [],
      mustNotActivate: ["unexpected"],
    },
  ];
  const observed = {
    activationSurfaceFingerprint: "old",
    cases: [
      {
        id: "case",
        activated: ["unexpected"],
        conditional: [],
      },
    ],
    metrics: {
      directEdges: 1,
      conditionalEdges: 0,
      totalEdges: 1,
      distinctDirectSkills: 1,
    },
  };

  const errors = validateObservedActivations(
    cases,
    observed,
    ["required", "unexpected"],
    "current",
  );
  assert.ok(errors.some((error) => error.includes("stale")));
  assert.ok(errors.some((error) => error.includes("missed required")));
  assert.ok(errors.some((error) => error.includes("unexpected activation")));
});
