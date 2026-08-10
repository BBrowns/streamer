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
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const lockPath = join(root, ".agents", "external-skills.lock.json");

function readLock() {
  return JSON.parse(readFileSync(lockPath, "utf8"));
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

function destinationFor(entry) {
  return join(
    root,
    ".agents",
    "skills",
    entry.name === "vercel-react-native-skills"
      ? "react-native-skills"
      : entry.name,
  );
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
