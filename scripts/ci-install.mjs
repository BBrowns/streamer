import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readPinnedNpmVersion(
  packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ),
) {
  const version = /^npm@(\d+\.\d+\.\d+)$/.exec(
    packageJson.packageManager ?? "",
  )?.[1];
  if (!version) {
    throw new Error("package.json must pin packageManager to npm@x.y.z");
  }
  return version;
}

export function buildInstallCommands(npmVersion) {
  const npmRunner = process.platform === "win32" ? "npx.cmd" : "npx";
  const npm = ["--yes", `npm@${npmVersion}`];
  return [
    {
      command: npmRunner,
      args: [...npm, "run", "security:install-scripts"],
      label: "dependency install-script policy",
    },
    {
      command: npmRunner,
      args: [...npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
      label: "npm ci with lifecycle scripts disabled",
    },
    {
      command: npmRunner,
      args: [...npm, "run", "postinstall"],
      label: "reviewed dependency patches",
    },
    {
      command: npmRunner,
      args: [
        ...npm,
        "run",
        "--prefix",
        "node_modules/node-datachannel",
        "rebuild",
        "--foreground-scripts",
      ],
      label: "approved native addon rebuild",
    },
  ];
}

export function runCiInstall({
  env = process.env,
  spawn = spawnSync,
  packageJson,
} = {}) {
  const pinnedNpm = readPinnedNpmVersion(packageJson);
  const requestedNpm = env.NPM_VERSION ?? pinnedNpm;
  if (requestedNpm !== pinnedNpm) {
    throw new Error(
      `NPM_VERSION ${requestedNpm} does not match packageManager npm@${pinnedNpm}`,
    );
  }

  for (const step of buildInstallCommands(pinnedNpm)) {
    console.log(`Running ${step.label}...`);
    const result = spawn(step.command, step.args, {
      cwd: root,
      env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${step.label} failed with exit code ${result.status}`);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runCiInstall();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
