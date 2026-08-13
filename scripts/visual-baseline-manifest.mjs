#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const require = createRequire(import.meta.url);

export const visualBaselineFileNames = Object.freeze([
  "addons-install-success-dark-desktop-renderer.png",
  "addons-install-success-dark-phone-web.png",
  "addons-install-success-light-desktop-renderer.png",
  "addons-install-success-light-phone-web.png",
  "detail-actions-dark-desktop-renderer.png",
  "detail-actions-dark-phone-web.png",
  "detail-actions-light-desktop-renderer.png",
  "detail-actions-light-phone-web.png",
  "downloads-mixed-dark-desktop-renderer.png",
  "downloads-mixed-dark-phone-web.png",
  "downloads-mixed-light-desktop-renderer.png",
  "downloads-mixed-light-phone-web.png",
  "home-dark-desktop-renderer.png",
  "home-dark-phone-web.png",
  "home-light-desktop-renderer.png",
  "home-light-phone-web.png",
  "login-dark-desktop-renderer.png",
  "login-dark-phone-web.png",
  "login-light-desktop-renderer.png",
  "login-light-phone-web.png",
  "notifications-populated-dark-desktop-renderer.png",
  "notifications-populated-dark-phone-web.png",
  "notifications-populated-light-desktop-renderer.png",
  "notifications-populated-light-phone-web.png",
  "onboarding-setup-dark-desktop-renderer.png",
  "onboarding-setup-dark-phone-web.png",
  "onboarding-setup-light-desktop-renderer.png",
  "onboarding-setup-light-phone-web.png",
  "player-actionable-fallback-dark-phone-web.png",
  "player-dark-desktop-renderer.png",
  "player-dark-phone-web.png",
  "player-hover-preview-dark-desktop-renderer.png",
  "player-inspect-sheet-dark-desktop-renderer.png",
  "player-progressive-nonseekable-dark-desktop-renderer.png",
  "player-scrubbing-preview-dark-phone-web.png",
  "player-subtitle-sheet-dark-phone-web.png",
  "search-results-dark-desktop-renderer.png",
  "search-results-dark-phone-web.png",
  "search-results-light-desktop-renderer.png",
  "search-results-light-phone-web.png",
  "settings-overview-dark-desktop-renderer.png",
  "settings-overview-dark-phone-web.png",
  "settings-overview-light-desktop-renderer.png",
  "settings-overview-light-phone-web.png",
]);

export const defaultLinuxBaselineDirectory = join(
  repoRoot,
  "tests",
  "golden-path",
  "visual-regression.spec.ts-snapshots",
  "linux",
);

function fileDigest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Verify the complete, exact set of Linux screenshot names before an artifact
 * can be uploaded or imported. This prevents a partial artifact from becoming
 * an apparently valid source-controlled CI baseline.
 */
export function collectVisualBaselineManifest(directory, options = {}) {
  let entryNames;
  try {
    entryNames = readdirSync(directory);
  } catch {
    throw new Error(`Visual baseline directory is unavailable: ${directory}`);
  }

  const pngNames = entryNames.filter((name) => name.endsWith(".png")).sort();
  const missing = visualBaselineFileNames.filter(
    (name) => !pngNames.includes(name),
  );
  const unexpected = pngNames.filter(
    (name) => !visualBaselineFileNames.includes(name),
  );
  if (missing.length > 0 || unexpected.length > 0) {
    const problems = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : undefined,
      unexpected.length > 0
        ? `unexpected: ${unexpected.join(", ")}`
        : undefined,
    ].filter(Boolean);
    throw new Error(`Visual baseline set is invalid (${problems.join("; ")}).`);
  }

  const files = visualBaselineFileNames.map((name) => {
    const path = join(directory, name);
    const stats = lstatSync(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size <= 0) {
      throw new Error(
        `Visual baseline is not a non-empty regular file: ${name}`,
      );
    }

    return {
      name,
      bytes: stats.size,
      sha256: fileDigest(path),
    };
  });

  return {
    schemaVersion: 1,
    platform: options.platform ?? process.platform,
    sourceCommit: options.sourceCommit ?? process.env.GITHUB_SHA ?? null,
    playwrightVersion: require("@playwright/test/package.json").version,
    expectedFileCount: visualBaselineFileNames.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    files,
  };
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index === -1 ? undefined : args[index + 1];
}

export function writeVisualBaselineManifest(options = {}) {
  const directory = options.directory ?? defaultLinuxBaselineDirectory;
  const manifest = collectVisualBaselineManifest(directory, options);
  const output = options.output;

  if (output) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return manifest;
}

function main() {
  const args = process.argv.slice(2);
  const manifest = writeVisualBaselineManifest({
    directory: optionValue(args, "--directory"),
    output: optionValue(args, "--output"),
    platform: optionValue(args, "--platform"),
    sourceCommit: optionValue(args, "--source-commit"),
  });
  console.log(
    `Verified ${manifest.expectedFileCount} ${manifest.platform} visual baselines (${manifest.totalBytes} bytes).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
