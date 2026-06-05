const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "../..");

const requiredFiles = [
  path.join(root, "dist/main.js"),
  path.join(root, "dist/preload.js"),
  path.join(root, "dist/bridge-runtime.js"),
  path.join(repoRoot, "packages/stream-server/dist/index.js"),
  path.join(root, "vendor/node/darwin-arm64/bin/node"),
  path.join(root, "vendor/node/darwin-x64/bin/node"),
  path.join(
    repoRoot,
    "node_modules/node-datachannel/build/Release/node_datachannel.node",
  ),
];

const missing = requiredFiles.filter((filePath) => !fs.existsSync(filePath));

if (missing.length > 0) {
  console.error("[desktop] Missing package inputs:");
  for (const filePath of missing) {
    console.error(`- ${path.relative(repoRoot, filePath)}`);
  }
  process.exitCode = 1;
} else {
  console.log("[desktop] Package inputs are present.");
}
