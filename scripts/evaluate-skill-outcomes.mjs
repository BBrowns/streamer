#!/usr/bin/env node
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = process.cwd();
const defaultCasesPath = join(
  defaultRoot,
  ".agents",
  "evals",
  "skills",
  "outcome-cases.json",
);

function unique(values) {
  return [...new Set(values)];
}

export function parseOutcomeArguments(argv) {
  const options = {
    model: null,
    caseIds: [],
    runs: 1,
    outputDir: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--model") {
      options.model = argv[++index] ?? null;
      if (!options.model) throw new Error("--model requires an id");
    } else if (argument === "--case") {
      const id = argv[++index];
      if (!id) throw new Error("--case requires an id");
      options.caseIds.push(id);
    } else if (argument === "--runs") {
      options.runs = Number(argv[++index]);
      if (!Number.isInteger(options.runs) || options.runs < 1) {
        throw new Error("--runs must be a positive integer");
      }
    } else if (argument === "--output-dir") {
      options.outputDir = argv[++index] ?? null;
      if (!options.outputDir) throw new Error("--output-dir requires a path");
    } else {
      throw new Error(`Unknown skills:eval:ab argument: ${argument}`);
    }
  }
  options.caseIds = unique(options.caseIds);
  return options;
}

export function validateOutcomeConfiguration(
  configuration,
  { repoRoot = defaultRoot, knownSkills = null } = {},
) {
  const errors = [];
  if (configuration?.version !== 1) {
    errors.push("outcome cases: version must be 1");
  }
  const cases = Array.isArray(configuration?.cases) ? configuration.cases : [];
  if (cases.length === 0)
    errors.push("outcome cases: at least one case is required");
  const skillNames = new Set(
    knownSkills ??
      readdirSync(join(repoRoot, ".agents", "skills")).filter((name) =>
        name.startsWith("streamer-"),
      ),
  );
  const ids = new Set();
  for (const entry of cases) {
    const label = entry?.id || "<missing>";
    if (typeof entry?.id !== "string" || !/^[a-z0-9-]+$/.test(entry.id)) {
      errors.push("outcome case: id must use lowercase kebab-case");
    } else if (ids.has(entry.id)) {
      errors.push(`outcome case ${entry.id}: duplicate id`);
    }
    ids.add(entry?.id);
    if (typeof entry?.prompt !== "string" || !entry.prompt.trim()) {
      errors.push(`outcome case ${label}: missing prompt`);
    }
    if (!skillNames.has(entry?.expectedSkill)) {
      errors.push(
        `outcome case ${label}: unknown skill ${entry?.expectedSkill ?? "missing"}`,
      );
    }
    if (
      !Array.isArray(entry?.allowedChanges) ||
      entry.allowedChanges.length === 0 ||
      entry.allowedChanges.some(
        (path) => typeof path !== "string" || !path.trim(),
      )
    ) {
      errors.push(`outcome case ${label}: allowedChanges must be non-empty`);
    }
    if (entry?.verifyCommand !== "node --test acceptance.test.mjs") {
      errors.push(
        `outcome case ${label}: verifyCommand must be node --test acceptance.test.mjs`,
      );
    }
    const fixture = join(
      repoRoot,
      ".agents",
      "evals",
      "skills",
      "fixtures",
      entry?.fixture ?? "",
    );
    if (
      typeof entry?.fixture !== "string" ||
      !existsSync(join(fixture, "acceptance.test.mjs"))
    ) {
      errors.push(
        `outcome case ${label}: missing fixture ${entry?.fixture ?? ""}`,
      );
    }
  }
  return errors;
}

function timestampDirectory() {
  return new Date().toISOString().replaceAll(":", "-").replace(".000Z", "Z");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSnapshot(root) {
  const files = new Map();
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile()) {
        files.set(
          relative(root, path).replaceAll("\\", "/"),
          sha256(readFileSync(path)),
        );
      }
    }
  }
  return files;
}

function changedFiles(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .flatMap((path) => {
      if (!before.has(path)) return [{ path, change: "added" }];
      if (!after.has(path)) return [{ path, change: "deleted" }];
      if (before.get(path) !== after.get(path)) {
        return [{ path, change: "modified" }];
      }
      return [];
    });
}

function allowedPath(path, allowedChanges) {
  return allowedChanges.some((pattern) => {
    const normalized = pattern.replaceAll("\\", "/");
    if (normalized.endsWith("/**")) {
      const prefix = normalized.slice(0, -3);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    if (!normalized.includes("*")) return path === normalized;
    const expression = normalized
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]*");
    return new RegExp(`^${expression}$`).test(path);
  });
}

export function neutralizeToolRouting(source) {
  const replaceSection = (current, heading) => {
    const start = current.indexOf(heading);
    if (start < 0) throw new Error(`AGENTS.md is missing ${heading.slice(3)}`);
    const end = current.indexOf("\n## ", start + heading.length);
    const replacement = `${heading}\n\nRepository-local skill routing is disabled for this evaluation variant.\n`;
    return `${current.slice(0, start)}${replacement}${end < 0 ? "" : current.slice(end + 1)}`;
  };

  return replaceSection(
    replaceSection(source, "## Tool Routing"),
    "## Development Cycle",
  );
}

function copyEvaluationContext(repoRoot, workspace, variant) {
  const agents = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  writeFileSync(
    join(workspace, "AGENTS.md"),
    variant === "enabled" ? agents : neutralizeToolRouting(agents),
  );

  for (const document of [
    "AGENT_HANDOFF.md",
    "ARCHITECTURE.md",
    "PLAYBACK.md",
    "UI.md",
  ]) {
    const source = join(repoRoot, document);
    if (existsSync(source)) cpSync(source, join(workspace, document));
  }

  if (variant === "enabled") {
    const skillRoot = join(repoRoot, ".agents", "skills");
    if (!existsSync(skillRoot)) throw new Error("missing repository skills");
    cpSync(skillRoot, join(workspace, ".agents", "skills"), {
      recursive: true,
    });
  }
}

function parseUsage(jsonl) {
  let usage = null;
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.usage && typeof event.usage === "object") usage = event.usage;
    } catch {
      // Preserve raw JSONL as evidence even when a future event is not JSON.
    }
  }
  return usage;
}

function gitRevision(root) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function commandVersion(command) {
  try {
    return spawnSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    }).stdout.trim();
  } catch {
    return "unknown";
  }
}

function evaluationSurfaceFingerprint(repoRoot, casesSource) {
  const hash = createHash("sha256");
  hash.update(casesSource);
  hash.update(readFileSync(join(repoRoot, "AGENTS.md")));
  const skillRoot = join(repoRoot, ".agents", "skills");
  for (const skill of readdirSync(skillRoot).sort()) {
    const file = join(skillRoot, skill, "SKILL.md");
    if (!existsSync(file)) continue;
    hash.update(skill);
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runCase({
  repoRoot,
  codexCommand,
  outputDir,
  caseDefinition,
  variant,
  runNumber,
  model,
}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "streamer-skill-ab-"));
  const workspace = join(temporaryRoot, "workspace");
  const artifactDirectory = join(
    outputDir,
    caseDefinition.id,
    variant,
    `run-${runNumber}`,
  );
  mkdirSync(artifactDirectory, { recursive: true });
  try {
    cpSync(
      join(
        repoRoot,
        ".agents",
        "evals",
        "skills",
        "fixtures",
        caseDefinition.fixture,
      ),
      workspace,
      { recursive: true },
    );
    copyEvaluationContext(repoRoot, workspace, variant);
    const before = fileSnapshot(workspace);
    const finalMessagePath = join(artifactDirectory, "final.txt");
    const prompt = [
      "Work only inside this isolated evaluation fixture.",
      "Do not access the internet, publish changes, or modify external state.",
      "Do not edit AGENTS.md, repository skills, canonical context, or acceptance tests.",
      caseDefinition.prompt,
      `Run this exact verification before finishing: ${caseDefinition.verifyCommand}`,
    ].join("\n\n");
    const args = [
      "exec",
      "-C",
      workspace,
      "--sandbox",
      "workspace-write",
      "--ephemeral",
      "--ignore-user-config",
      "--skip-git-repo-check",
      "--json",
      "--output-last-message",
      finalMessagePath,
    ];
    if (model) args.push("--model", model);
    args.push(prompt);

    const startedAt = Date.now();
    const codex = spawnSync(codexCommand, args, {
      cwd: workspace,
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_EVAL_CASE: caseDefinition.id,
        CODEX_EVAL_VARIANT: variant,
      },
      maxBuffer: 50 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });
    const durationMs = Date.now() - startedAt;
    const jsonl = codex.stdout ?? "";
    const stderr = codex.stderr ?? "";
    writeFileSync(join(artifactDirectory, "codex.jsonl"), jsonl);
    writeFileSync(join(artifactDirectory, "codex.stderr.txt"), stderr);
    if (!existsSync(finalMessagePath)) writeFileSync(finalMessagePath, "");
    const finalMessage = readFileSync(finalMessagePath, "utf8");
    const after = fileSnapshot(workspace);
    const modifications = changedFiles(before, after);
    const scopeViolations = modifications
      .filter(({ path }) => !allowedPath(path, caseDefinition.allowedChanges))
      .map(({ path }) => path);

    const acceptance = spawnSync(caseDefinition.verifyCommand, {
      cwd: workspace,
      shell: true,
      encoding: "utf8",
      timeout: 60_000,
    });
    writeFileSync(
      join(artifactDirectory, "acceptance.txt"),
      `${acceptance.stdout ?? ""}${acceptance.stderr ?? ""}`,
    );
    writeJson(join(artifactDirectory, "changes.json"), modifications);

    const evidenceText = `${jsonl}\n${finalMessage}`;
    const result = {
      caseId: caseDefinition.id,
      variant,
      run: runNumber,
      model: model ?? "configured-default",
      codexStatus: Number.isInteger(codex.status) ? codex.status : 1,
      durationMs,
      tokens: parseUsage(jsonl),
      acceptance: {
        passed: acceptance.status === 0,
        status: Number.isInteger(acceptance.status) ? acceptance.status : 1,
        signal: acceptance.signal ?? null,
      },
      modifiedFiles: modifications,
      scopeViolations,
      verificationObserved: evidenceText.includes(caseDefinition.verifyCommand),
      skillObserved:
        variant === "enabled" &&
        evidenceText.includes(caseDefinition.expectedSkill),
    };
    result.passed =
      result.codexStatus === 0 &&
      result.acceptance.passed &&
      result.scopeViolations.length === 0;
    writeJson(join(artifactDirectory, "result.json"), result);
    return result;
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function runOutcomeEvaluation(
  options,
  {
    repoRoot = defaultRoot,
    casesPath = defaultCasesPath,
    codexCommand = "codex",
  } = {},
) {
  const casesSource = readFileSync(casesPath, "utf8");
  const configuration = JSON.parse(casesSource);
  const configurationErrors = validateOutcomeConfiguration(configuration, {
    repoRoot,
  });
  if (configurationErrors.length > 0) {
    throw new Error(configurationErrors.join("\n"));
  }
  const requested = new Set(options.caseIds ?? []);
  const cases = (configuration.cases ?? []).filter(
    (entry) => requested.size === 0 || requested.has(entry.id),
  );
  const missing = [...requested].filter(
    (id) => !cases.some((entry) => entry.id === id),
  );
  if (missing.length > 0) {
    throw new Error(`Unknown outcome case: ${missing.join(", ")}`);
  }
  if (cases.length === 0) throw new Error("No outcome cases selected");

  const outputDir = resolve(
    repoRoot,
    options.outputDir ??
      join(".agents", "evals", "results", timestampDirectory()),
  );
  mkdirSync(outputDir, { recursive: true });
  const runs = [];
  for (const caseDefinition of cases) {
    for (const variant of ["enabled", "disabled"]) {
      for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
        runs.push(
          runCase({
            repoRoot,
            codexCommand,
            outputDir,
            caseDefinition,
            variant,
            runNumber,
            model: options.model,
          }),
        );
      }
    }
  }

  const summary = {
    enabledPassed: runs.filter(
      (entry) => entry.variant === "enabled" && entry.passed,
    ).length,
    disabledPassed: runs.filter(
      (entry) => entry.variant === "disabled" && entry.passed,
    ).length,
    enabledScopeViolations: runs
      .filter((entry) => entry.variant === "enabled")
      .reduce((total, entry) => total + entry.scopeViolations.length, 0),
    disabledScopeViolations: runs
      .filter((entry) => entry.variant === "disabled")
      .reduce((total, entry) => total + entry.scopeViolations.length, 0),
  };
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    revision: gitRevision(repoRoot),
    codexVersion: commandVersion(codexCommand),
    model: options.model ?? "configured-default",
    runsPerVariant: options.runs,
    selectedCases: cases.map((entry) => entry.id),
    evaluationSurfaceFingerprint: evaluationSurfaceFingerprint(
      repoRoot,
      casesSource,
    ),
    summary,
    runs,
  };
  writeJson(join(outputDir, "report.json"), report);
  return report;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseOutcomeArguments(argv);
  const report = runOutcomeEvaluation(options);
  console.log(JSON.stringify(report.summary, null, 2));
  return report.runs.every((entry) => entry.passed) ? 0 : 1;
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
