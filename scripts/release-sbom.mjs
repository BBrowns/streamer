#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
export const DEFAULT_OUTPUT = "artifacts/release/sbom.spdx.json";

function parseOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

export function parseArgs(argv = []) {
  return {
    output: parseOption(argv, "--output", DEFAULT_OUTPUT),
    format: parseOption(argv, "--format", "spdx"),
    type: parseOption(argv, "--type", "application"),
    includeDev: argv.includes("--include-dev"),
  };
}

export function parseSbomOutput(stdout, format = "spdx") {
  let document;
  try {
    document = JSON.parse(String(stdout));
  } catch (error) {
    throw new Error(`npm sbom returned invalid JSON: ${error.message}`);
  }

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("npm sbom returned a non-object document");
  }

  if (format === "spdx" && typeof document.spdxVersion !== "string") {
    throw new Error("npm sbom did not return an SPDX document");
  }
  if (format === "cyclonedx" && document.bomFormat !== "CycloneDX") {
    throw new Error("npm sbom did not return a CycloneDX document");
  }

  return document;
}

function packageName(packagePath, packageInfo) {
  if (packageInfo.name) return packageInfo.name;
  if (packagePath === "") return "streamer";
  const marker = "node_modules/";
  const index = packagePath.lastIndexOf(marker);
  return index >= 0 ? packagePath.slice(index + marker.length) : packagePath;
}

function packageId(name, version, packagePath = "") {
  const digest = createHash("sha256")
    .update(`${packagePath}:${name}@${version}`)
    .digest("hex")
    .slice(0, 24);
  return `SPDXRef-${digest}`;
}

function lockfilePackage(packagePath, packageInfo, includeDev) {
  if (!packageInfo || !packageInfo.version) return null;
  if (!includeDev && packageInfo.dev === true) return null;

  const name = packageName(packagePath, packageInfo);
  const version = String(packageInfo.version);
  const license =
    typeof packageInfo.license === "string"
      ? packageInfo.license
      : "NOASSERTION";
  return {
    packagePath,
    name,
    version,
    id: packageId(name, version, packagePath),
    package: {
      SPDXID: packageId(name, version, packagePath),
      name,
      versionInfo: version,
      downloadLocation: packageInfo.resolved || "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: license,
      licenseDeclared: license,
    },
  };
}

export function createSpdxFromLockfile({
  lockfilePath,
  includeDev = false,
} = {}) {
  const absoluteLockfile = lockfilePath ?? join(repoRoot, "package-lock.json");
  const rawLockfile = readFileSync(absoluteLockfile, "utf8");
  const lockfile = JSON.parse(rawLockfile);
  const entries = Object.entries(lockfile.packages ?? {})
    .map(([packagePath, packageInfo]) =>
      lockfilePackage(packagePath, packageInfo, includeDev),
    )
    .filter(Boolean);
  const root = entries.find((entry) => entry.packagePath === "") ?? entries[0];
  if (!root) throw new Error("package-lock.json contains no package entries");

  const byTopLevelName = new Map(
    entries
      .filter(
        (entry) =>
          entry.packagePath === "" ||
          !entry.packagePath.includes("/node_modules/"),
      )
      .map((entry) => [entry.name, entry]),
  );
  const relationships = [
    {
      spdxElementId: "SPDXRef-DOCUMENT",
      relationshipType: "DESCRIBES",
      relatedSpdxElement: root.id,
    },
  ];
  for (const entry of entries) {
    const packageInfo = lockfile.packages[entry.packagePath];
    for (const dependencyName of Object.keys(packageInfo.dependencies ?? {})) {
      const dependency = byTopLevelName.get(dependencyName);
      if (!dependency || dependency.id === entry.id) continue;
      relationships.push({
        spdxElementId: entry.id,
        relationshipType: "DEPENDS_ON",
        relatedSpdxElement: dependency.id,
      });
    }
  }

  const lockDigest = createHash("sha256").update(rawLockfile).digest("hex");
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${root.name}@${root.version}`,
    documentNamespace: `https://spdx.org/spdxdocs/streamer-${lockDigest}`,
    creationInfo: {
      created: new Date().toISOString(),
      creators: ["Tool: streamer-release-sbom"],
    },
    documentDescribes: [root.id],
    packages: entries.map((entry) => entry.package),
    relationships,
  };
}

function runNpmSbom({ format, type, includeDev, spawn = spawnSync } = {}) {
  const args = [
    "sbom",
    "--package-lock-only",
    `--sbom-format=${format}`,
    `--sbom-type=${type}`,
  ];
  if (!includeDev) args.push("--omit=dev");

  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : "npm";
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const result = spawn(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || "").trim();
    if (format === "spdx" && details.includes("ESBOMPROBLEMS")) {
      return createSpdxFromLockfile({ includeDev });
    }
    throw new Error(`npm sbom failed${details ? `: ${details}` : ""}`);
  }

  return parseSbomOutput(result.stdout, format);
}

export function writeSbom(outputPath = DEFAULT_OUTPUT, options = {}) {
  const format = options.format ?? "spdx";
  const document = runNpmSbom({
    format,
    type: options.type ?? "application",
    includeDev: options.includeDev ?? false,
    spawn: options.spawn,
  });
  const absoluteOutput = isAbsolute(outputPath)
    ? outputPath
    : join(repoRoot, outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(document, null, 2)}\n`);
  return { absoluteOutput, document };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const result = writeSbom(options.output, options);
  console.log(`Wrote ${result.absoluteOutput}`);
}
