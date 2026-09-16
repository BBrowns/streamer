#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { runRuntimePreflight } from "./runtime-preflight.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function gitValue(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function parseArgs(argv) {
  const args = {
    surface: "electron",
    scenario: "playback",
    label: "manual",
    outputDir: "artifacts/qa-runs",
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--surface") args.surface = argv[++index] ?? args.surface;
    else if (value === "--scenario")
      args.scenario = argv[++index] ?? args.scenario;
    else if (value === "--label") args.label = argv[++index] ?? args.label;
    else if (value === "--output-dir")
      args.outputDir = argv[++index] ?? args.outputDir;
    else if (value === "--json") args.json = true;
    else throw new Error(`Unknown QA run argument: ${value}`);
  }
  return args;
}

export function createQaRunManifest({
  preflight,
  surface,
  scenario,
  label,
  now = new Date(),
  runId = `${now.toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
  revision = gitValue(["rev-parse", "HEAD"]),
  branch = gitValue(["branch", "--show-current"]),
} = {}) {
  return {
    version: 1,
    runId,
    generatedAt: now.toISOString(),
    label,
    surface,
    scenario,
    repository: { revision, branch },
    preflight,
    steps: [
      { id: "runtime-preflight", status: preflight?.status ?? "unknown" },
      { id: "manual-startup", status: "not-run" },
      { id: "manual-playback", status: "not-run" },
      { id: "manual-fallback", status: "not-run" },
      { id: "manual-cleanup", status: "not-run" },
    ],
    evidenceBoundary:
      "Preflight evidence does not prove playback, device, or network-source support.",
    claims: {
      startup: preflight?.status === "passed" ? "supported" : "not-proven",
      playback: "not-run",
      realDevice: "not-run",
      packagedRelease: "not-run",
    },
  };
}

export function renderQaRunMarkdown(manifest) {
  const steps = manifest.steps
    .map((step) => `| ${step.id} | ${step.status} |`)
    .join("\n");
  return `# QA Run ${manifest.runId}

- Generated: ${manifest.generatedAt}
- Label: ${manifest.label}
- Surface: ${manifest.surface}
- Scenario: ${manifest.scenario}
- Revision: ${manifest.repository.revision}
- Branch: ${manifest.repository.branch}

## Preflight

- Status: **${manifest.preflight?.status ?? "unknown"}**
- Boundary: ${manifest.evidenceBoundary}

## Steps

| Step | Status |
| --- | --- |
${steps}

## Claims

- Startup: ${manifest.claims.startup}
- Playback: ${manifest.claims.playback}
- Real device: ${manifest.claims.realDevice}
- Packaged release: ${manifest.claims.packagedRelease}
`;
}

export function preflightSurfaceForQa(surface) {
  return surface === "ui" || surface === "web" ? "ui" : "playback";
}

export async function writeQaRun({ outputDir, ...options } = {}) {
  const preflight =
    options.preflight ??
    (await runRuntimePreflight({
      surface: preflightSurfaceForQa(options.surface),
    }));
  const manifest = createQaRunManifest({ ...options, preflight });
  const directory = join(root, outputDir ?? "artifacts/qa-runs");
  mkdirSync(directory, { recursive: true });
  const jsonPath = join(directory, `${manifest.runId}.json`);
  const markdownPath = join(directory, `${manifest.runId}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(markdownPath, renderQaRunMarkdown(manifest));
  return { manifest, jsonPath, markdownPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeQaRun(parseArgs(process.argv.slice(2)))
    .then(({ manifest }) => {
      console.log(JSON.stringify(manifest, null, 2));
      process.exitCode = manifest.preflight.status === "blocked" ? 1 : 0;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
