import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { validateOutcomeConfiguration } from "./evaluate-skill-outcomes.mjs";

function loadCases(root) {
  const file = join(
    root,
    ".agents",
    "evals",
    "skills",
    "activation-cases.jsonl",
  );
  if (!existsSync(file))
    return { cases: [], errors: ["missing skill activation cases"] };

  const cases = [];
  const errors = [];
  for (const [index, line] of readFileSync(file, "utf8")
    .split(/\r?\n/)
    .entries()) {
    if (!line.trim()) continue;
    try {
      cases.push(JSON.parse(line));
    } catch {
      errors.push(`activation-cases.jsonl:${index + 1}: invalid JSON`);
    }
  }
  return { cases, errors };
}

export function activationSurfaceFingerprint(root, expectedSkills) {
  const hash = createHash("sha256");
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  const routingStart = agents.indexOf("## Tool Routing");
  const routingEnd = agents.indexOf("\n## ", routingStart + 3);
  if (routingStart < 0) throw new Error("AGENTS.md is missing Tool Routing");
  const routing = agents.slice(
    routingStart,
    routingEnd < 0 ? agents.length : routingEnd,
  );
  hash.update("AGENTS.md#tool-routing");
  hash.update("\0");
  hash.update(routing);
  hash.update("\0");

  const cases = readFileSync(
    join(root, ".agents", "evals", "skills", "activation-cases.jsonl"),
  );
  hash.update("activation-cases.jsonl");
  hash.update("\0");
  hash.update(cases);
  hash.update("\0");

  for (const skill of [...expectedSkills].sort()) {
    const file = join(root, ".agents", "skills", skill, "SKILL.md");
    const source = readFileSync(file, "utf8");
    const frontmatter = source.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0];
    if (!frontmatter) throw new Error(`${skill} is missing frontmatter`);
    hash.update(skill);
    hash.update("\0");
    hash.update(frontmatter);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function validateObservedActivations(
  cases,
  observed,
  expectedSkills,
  expectedFingerprint,
) {
  const errors = [];
  const known = new Set(expectedSkills);
  const expectedById = new Map(cases.map((entry) => [entry.id, entry]));
  const results = Array.isArray(observed?.cases) ? observed.cases : [];
  const resultIds = results.map((entry) => entry.id).sort();
  const expectedIds = [...expectedById.keys()].sort();

  if (observed?.activationSurfaceFingerprint !== expectedFingerprint) {
    errors.push(
      "observed skill activation result is stale for the current routing surface",
    );
  }
  if (JSON.stringify(resultIds) !== JSON.stringify(expectedIds)) {
    errors.push(
      "observed skill activation cases must exactly match eval cases",
    );
  }

  let directEdges = 0;
  let conditionalEdges = 0;
  const distinctDirect = new Set();
  for (const result of results) {
    const expected = expectedById.get(result.id);
    if (!expected) continue;
    const direct = Array.isArray(result.activated) ? result.activated : [];
    const conditional = Array.isArray(result.conditional)
      ? result.conditional
      : [];
    const directSet = new Set(direct);
    const conditionalSet = new Set(conditional);
    if (
      !Array.isArray(result.activated) ||
      !Array.isArray(result.conditional)
    ) {
      errors.push(
        `observed skill eval ${result.id}: invalid activation arrays`,
      );
      continue;
    }
    for (const skill of [...direct, ...conditional]) {
      if (!known.has(skill)) {
        errors.push(`observed skill eval ${result.id}: unknown skill ${skill}`);
      }
      if (directSet.has(skill) && conditionalSet.has(skill)) {
        errors.push(
          `observed skill eval ${result.id}: ${skill} is direct and conditional`,
        );
      }
    }
    for (const skill of expected.mustActivate) {
      if (!directSet.has(skill)) {
        errors.push(
          `observed skill eval ${result.id}: missed required ${skill}`,
        );
      }
    }
    const allowed = new Set([
      ...expected.mustActivate,
      ...expected.mayActivate,
    ]);
    for (const skill of new Set([...direct, ...conditional])) {
      if (!allowed.has(skill)) {
        errors.push(
          `observed skill eval ${result.id}: unexpected activation ${skill}`,
        );
      }
    }
    directEdges += direct.length;
    conditionalEdges += conditional.length;
    direct.forEach((skill) => distinctDirect.add(skill));
  }

  const actualMetrics = {
    directEdges,
    conditionalEdges,
    totalEdges: directEdges + conditionalEdges,
    distinctDirectSkills: distinctDirect.size,
  };
  for (const [key, value] of Object.entries(actualMetrics)) {
    if (observed?.metrics?.[key] !== value) {
      errors.push(
        `observed skill activation metric ${key} must equal ${value}`,
      );
    }
  }
  return errors;
}

export function validateSkillEvalData(cases, registry, expectedSkills) {
  const errors = [];
  const known = new Set(expectedSkills);
  const ids = new Set();
  let positiveCases = 0;
  let negativeCases = 0;

  for (const entry of cases) {
    if (typeof entry.id !== "string" || !entry.id) {
      errors.push("skill eval: every case needs an id");
      continue;
    }
    if (ids.has(entry.id)) errors.push(`skill eval ${entry.id}: duplicate id`);
    ids.add(entry.id);
    if (typeof entry.prompt !== "string" || !entry.prompt.trim()) {
      errors.push(`skill eval ${entry.id}: missing prompt`);
    }
    if (typeof entry.reason !== "string" || !entry.reason.trim()) {
      errors.push(`skill eval ${entry.id}: missing reason`);
    }

    const groups = ["mustActivate", "mayActivate", "mustNotActivate"];
    const values = Object.fromEntries(
      groups.map((group) => [
        group,
        Array.isArray(entry[group]) ? entry[group] : [],
      ]),
    );
    for (const group of groups) {
      if (!Array.isArray(entry[group])) {
        errors.push(`skill eval ${entry.id}: ${group} must be an array`);
      }
      for (const skill of values[group]) {
        if (!known.has(skill)) {
          errors.push(`skill eval ${entry.id}: unknown skill ${skill}`);
        }
      }
    }
    const activated = new Set([...values.mustActivate, ...values.mayActivate]);
    for (const skill of values.mustNotActivate) {
      if (activated.has(skill)) {
        errors.push(
          `skill eval ${entry.id}: ${skill} is both allowed and forbidden`,
        );
      }
    }
    if (values.mustActivate.length > 0) positiveCases += 1;
    else negativeCases += 1;
  }

  if (positiveCases === 0)
    errors.push("skill evals need at least one activation case");
  if (negativeCases === 0)
    errors.push("skill evals need at least one non-activation case");

  const registered = Object.keys(registry?.skills ?? {}).sort();
  if (
    JSON.stringify(registered) !== JSON.stringify([...expectedSkills].sort())
  ) {
    errors.push("skill registry entries must exactly match repository skills");
  }
  for (const skill of registered) {
    const record = registry.skills[skill];
    for (const field of ["owner", "purpose", "evidence", "removalCriteria"]) {
      if (typeof record?.[field] !== "string" || !record[field].trim()) {
        errors.push(`skill registry ${skill}: missing ${field}`);
      }
    }
    if (!Array.isArray(record?.evalCases) || record.evalCases.length === 0) {
      errors.push(`skill registry ${skill}: missing evalCases`);
    } else {
      for (const id of record.evalCases) {
        if (!ids.has(id))
          errors.push(`skill registry ${skill}: unknown eval case ${id}`);
      }
    }
  }
  return errors;
}

export function validateSkillEvals(
  root = process.cwd(),
  expectedSkills = null,
) {
  const skillRoot = join(root, ".agents", "skills");
  const skills =
    expectedSkills ??
    (existsSync(skillRoot)
      ? readdirSync(skillRoot).filter((name) => name.startsWith("streamer-"))
      : []);
  const loaded = loadCases(root);
  const registryFile = join(root, ".agents", "skill-registry.json");
  const observedFile = join(
    root,
    ".agents",
    "evals",
    "skills",
    "activation-result.json",
  );
  const outcomeFile = join(
    root,
    ".agents",
    "evals",
    "skills",
    "outcome-cases.json",
  );
  if (!existsSync(registryFile))
    return [...loaded.errors, "missing skill registry"];
  if (!existsSync(observedFile))
    return [...loaded.errors, "missing observed skill activation result"];
  if (!existsSync(outcomeFile))
    return [...loaded.errors, "missing skill outcome cases"];
  try {
    const registry = JSON.parse(readFileSync(registryFile, "utf8"));
    const observed = JSON.parse(readFileSync(observedFile, "utf8"));
    const outcomeConfiguration = JSON.parse(readFileSync(outcomeFile, "utf8"));
    return [
      ...loaded.errors,
      ...validateSkillEvalData(loaded.cases, registry, skills),
      ...validateObservedActivations(
        loaded.cases,
        observed,
        skills,
        activationSurfaceFingerprint(root, skills),
      ),
      ...validateOutcomeConfiguration(outcomeConfiguration, {
        repoRoot: root,
        knownSkills: skills,
      }),
    ];
  } catch {
    return [
      ...loaded.errors,
      "skill registry or activation result is not valid JSON",
    ];
  }
}

export function main() {
  const errors = validateSkillEvals();
  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    return 1;
  }
  console.log("Skill evaluation assets are valid.");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
