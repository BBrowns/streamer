"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const desktopRoot = path.resolve(__dirname, "..");
const mobileRoot = path.resolve(desktopRoot, "../mobile");
const sourceDir = path.join(mobileRoot, "dist");
const targetDir = path.join(desktopRoot, "dist", "renderer");

function runWebExport() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npmCommand,
    ["run", "web:export", "--workspace=apps/mobile"],
    {
      cwd: path.resolve(desktopRoot, "../.."),
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Mobile web export failed with exit code ${result.status}.`,
    );
  }
}

function copyRenderer() {
  const entrypoint = path.join(sourceDir, "index.html");
  if (!fs.existsSync(entrypoint)) {
    throw new Error(`Mobile web export did not produce ${entrypoint}.`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  const entrypointPath = path.join(targetDir, "index.html");
  const entrypointHtml = fs.readFileSync(entrypointPath, "utf8");
  fs.writeFileSync(
    entrypointPath,
    rewriteRendererAssetPathsForFileProtocol(entrypointHtml),
  );
  fs.copyFileSync(
    path.join(desktopRoot, "src", "renderer-error.html"),
    path.join(targetDir, "renderer-error.html"),
  );
  console.log(`[desktop] Bundled mobile web renderer into ${targetDir}`);
}

function rewriteRendererAssetPathsForFileProtocol(html) {
  return html.replace(/((?:src|href)=['"])\/(?!\/)/g, "$1./");
}

function buildRenderer() {
  runWebExport();
  copyRenderer();
}

if (require.main === module) buildRenderer();

module.exports = {
  buildRenderer,
  copyRenderer,
  rewriteRendererAssetPathsForFileProtocol,
  runWebExport,
};
