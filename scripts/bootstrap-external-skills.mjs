import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const lockPath = join(root, ".agents", "external-skills.lock.json");
const skillsRoot = join(root, ".agents", "skills");
const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_SHA = /^[0-9a-f]{40}$/i;

function isSafeRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("-") ||
    value.includes("\\") ||
    value.includes("\0") ||
    isAbsolute(value)
  )
    return false;
  return value
    .split("/")
    .every((segment) => segment && segment !== "." && segment !== "..");
}

export function validateEntry(entry) {
  if (!entry || typeof entry !== "object")
    throw new Error("External skill lock entries must be objects");
  if (!SAFE_NAME.test(entry.name ?? ""))
    throw new Error(`Invalid external skill name: ${entry.name}`);
  if (!SAFE_REPOSITORY.test(entry.repository ?? ""))
    throw new Error(`Invalid external skill repository: ${entry.repository}`);
  if (!isSafeRelativePath(entry.path))
    throw new Error(`Invalid external skill path: ${entry.path}`);
  if (!SAFE_SHA.test(entry.ref ?? ""))
    throw new Error(
      `External skill ref must be a full commit SHA: ${entry.name}`,
    );
  return entry;
}

function readLock() {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (!lock || !Array.isArray(lock.skills))
    throw new Error("External skill lock must contain a skills array");
  lock.skills.forEach(validateEntry);
  return lock;
}

function markerPath(destination) {
  return join(destination, ".streamer-source.json");
}

function expectedMarker(entry) {
  return (
    JSON.stringify(
      {
        name: entry.name,
        repository: entry.repository,
        path: entry.path,
        ref: entry.ref,
      },
      null,
      2,
    ) + "\n"
  );
}

export function destinationFor(entry) {
  validateEntry(entry);
  const name =
    entry.name === "vercel-react-native-skills"
      ? "react-native-skills"
      : entry.name;
  const destination = resolve(skillsRoot, name);
  const relativeDestination = relative(skillsRoot, destination);
  if (
    !relativeDestination ||
    relativeDestination.startsWith("..") ||
    isAbsolute(relativeDestination)
  )
    throw new Error(`External skill destination escapes ${skillsRoot}`);
  return destination;
}

function install(entry, force) {
  const destination = destinationFor(entry);
  if (existsSync(destination) && !force) {
    throw new Error(
      `${entry.name} already exists; use --force only to replace this local installation`,
    );
  }

  const temporary = mkdtempSync(join(tmpdir(), "streamer-skill-"));
  try {
    const repositoryUrl = `https://github.com/${entry.repository}.git`;
    execFileSync(
      "git",
      [
        "clone",
        "--filter=blob:none",
        "--no-checkout",
        "--depth",
        "1",
        repositoryUrl,
        temporary,
      ],
      { stdio: "inherit" },
    );
    execFileSync(
      "git",
      ["-C", temporary, "fetch", "--depth", "1", "origin", entry.ref],
      { stdio: "inherit" },
    );
    execFileSync(
      "git",
      ["-C", temporary, "sparse-checkout", "init", "--cone"],
      { stdio: "inherit" },
    );
    execFileSync(
      "git",
      ["-C", temporary, "sparse-checkout", "set", entry.path],
      { stdio: "inherit" },
    );
    execFileSync("git", ["-C", temporary, "checkout", "--detach", entry.ref], {
      stdio: "inherit",
    });

    const source = join(temporary, entry.path);
    if (!existsSync(join(source, "SKILL.md")))
      throw new Error(`${entry.name} source has no SKILL.md`);
    if (existsSync(destination))
      rmSync(destination, { recursive: true, force: true });
    mkdirSync(join(destination, ".."), { recursive: true });
    cpSync(source, destination, { recursive: true });
    writeFileSync(markerPath(destination), expectedMarker(entry));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function check(entries) {
  const problems = [];
  for (const entry of entries) {
    const destination = destinationFor(entry);
    if (!existsSync(join(destination, "SKILL.md"))) {
      problems.push(`${entry.name}: not installed`);
      continue;
    }
    if (
      !existsSync(markerPath(destination)) ||
      readFileSync(markerPath(destination), "utf8") !== expectedMarker(entry)
    ) {
      problems.push(`${entry.name}: local source marker differs from the lock`);
    }
  }
  return problems;
}

export function main(argv = process.argv.slice(2)) {
  const force = argv.includes("--force");
  const checkOnly = argv.includes("--check");
  const lock = readLock();
  if (checkOnly) {
    const problems = check(lock.skills);
    if (problems.length) {
      console.error(problems.map((problem) => `- ${problem}`).join("\n"));
      return 1;
    }
    console.log("External skills match the pinned lock.");
    return 0;
  }
  for (const entry of lock.skills) install(entry, force);
  console.log(
    `Installed ${lock.skills.length} external skills from pinned commits.`,
  );
  return 0;
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
