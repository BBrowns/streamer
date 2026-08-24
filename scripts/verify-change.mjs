import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const defaultMapPath = resolve(root, "config", "verification-map.json");

function unique(values) {
  return [...new Set(values)];
}

function normalizeFiles(files) {
  return unique(
    files.map((file) => file.trim().replaceAll("\\", "/")).filter(Boolean),
  ).sort();
}

export function parseArguments(argv) {
  const parsed = {
    mode: "plan",
    json: false,
    files: [],
    base: null,
    output: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--plan", "--focused", "--final"].includes(argument)) {
      parsed.mode = argument.slice(2);
    } else if (argument === "--json") {
      parsed.json = true;
    } else if (argument === "--files") {
      parsed.files.push(...(argv[++index] ?? "").split(","));
    } else if (argument === "--file") {
      parsed.files.push(argv[++index] ?? "");
    } else if (argument === "--base") {
      parsed.base = argv[++index] ?? null;
    } else if (argument === "--output") {
      parsed.output = argv[++index] ?? null;
      if (!parsed.output) throw new Error("--output requires a path");
    } else {
      throw new Error(`Unknown verify-change argument: ${argument}`);
    }
  }

  parsed.files = normalizeFiles(parsed.files);
  return parsed;
}

function gitLines(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function discoverChangedFiles(base = null) {
  const files = [];
  if (base) files.push(...gitLines(["diff", "--name-only", `${base}...HEAD`]));
  files.push(...gitLines(["diff", "--name-only", "HEAD"]));
  files.push(...gitLines(["ls-files", "--others", "--exclude-standard"]));
  return normalizeFiles(files);
}

function readMap(mapPath = defaultMapPath) {
  return JSON.parse(readFileSync(mapPath, "utf8"));
}

function ruleMatches(rule, files) {
  const patterns = rule.patterns.map((pattern) => new RegExp(pattern));
  return files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

export function buildVerificationPlan(files, map = readMap()) {
  const normalizedFiles = normalizeFiles(files);
  const matched = unique(
    normalizedFiles.flatMap((file) => {
      const matches = map.rules.filter((rule) => ruleMatches(rule, [file]));
      return matches.length > 0 ? matches : [map.fallback];
    }),
  );
  const selected = matched.length > 0 ? matched : [map.fallback];

  return {
    files: normalizedFiles,
    rules: selected.map((rule) => rule.id),
    focusedCommands: unique(selected.flatMap((rule) => rule.focusedCommands)),
    finalCommands: unique(selected.flatMap((rule) => rule.finalCommands)),
  };
}

function fingerprintFiles(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const absolute = resolve(root, file);
    hash.update(file);
    hash.update("\0");
    hash.update(existsSync(absolute) ? readFileSync(absolute) : "<missing>");
    hash.update("\0");
  }
  return hash.digest("hex");
}

function fingerprintPath(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function revision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function defaultRunner(command) {
  return spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: "inherit",
  });
}

function runtimeEvidence() {
  let npm = "unknown";
  try {
    npm = execFileSync("npm", ["--version"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    // A missing npm binary is recorded instead of hiding the verification run.
  }
  return {
    node: process.version,
    npm,
    platform: `${process.platform}/${process.arch}`,
  };
}

export function runVerificationPlan(
  plan,
  mode,
  runner = defaultRunner,
  { mapPath = defaultMapPath, now = () => Date.now() } = {},
) {
  const commands =
    mode === "final"
      ? unique([...plan.focusedCommands, ...plan.finalCommands])
      : plan.focusedCommands;
  const results = [];
  const startedAtMs = now();

  for (const command of commands) {
    const commandStartedAtMs = now();
    const result = runner(command);
    const commandFinishedAtMs = now();
    const status = Number.isInteger(result.status) ? result.status : 1;
    results.push({
      command,
      status,
      signal: result.signal ?? null,
      durationMs: Math.max(0, commandFinishedAtMs - commandStartedAtMs),
    });
    if (status !== 0) break;
  }

  const finishedAtMs = now();

  return {
    version: 2,
    mode,
    generatedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    revision: revision(),
    fingerprint: fingerprintFiles(plan.files),
    verificationMapFingerprint: fingerprintPath(mapPath),
    runtime: runtimeEvidence(),
    ...plan,
    results,
    status:
      results.length === commands.length &&
      results.every(({ status }) => status === 0)
        ? "passed"
        : "failed",
  };
}

function writeJsonAtomically(outputPath, value) {
  const target = resolve(root, outputPath);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  mkdirSync(dirname(target), { recursive: true });
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function renderPlan(plan) {
  return [
    `Files (${plan.files.length}):`,
    ...plan.files.map((file) => `- ${file}`),
    `Rules: ${plan.rules.join(", ")}`,
    "Focused commands:",
    ...plan.focusedCommands.map((command) => `- ${command}`),
    "Final commands:",
    ...(plan.finalCommands.length > 0
      ? plan.finalCommands.map((command) => `- ${command}`)
      : ["- none"]),
  ].join("\n");
}

export function main(
  argv = process.argv.slice(2),
  { runner = defaultRunner, writeStdout = console.log } = {},
) {
  const options = parseArguments(argv);
  const files =
    options.files.length > 0
      ? options.files
      : discoverChangedFiles(options.base);
  const plan = buildVerificationPlan(files);

  if (options.mode === "plan") {
    if (options.output) writeJsonAtomically(options.output, plan);
    writeStdout(
      options.json ? JSON.stringify(plan, null, 2) : renderPlan(plan),
    );
    return 0;
  }

  const receipt = runVerificationPlan(plan, options.mode, runner);
  if (options.output) writeJsonAtomically(options.output, receipt);
  writeStdout(
    options.json ? JSON.stringify(receipt, null, 2) : JSON.stringify(receipt),
  );
  return receipt.status === "passed" ? 0 : 1;
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
