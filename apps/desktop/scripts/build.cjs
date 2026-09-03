const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
const entryFiles = [
  "main.js",
  "renderer-loader.js",
  "preload.js",
  "security.js",
  "build-metadata.js",
  "download-paths.js",
  "download-job-persistence.js",
  "download-recovery-policy.js",
  "download-url-policy.js",
  "hls-offline.js",
  "sentry.js",
  "bridge-runtime.js",
  "desktop-bonjour.js",
];

function build() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  for (const file of entryFiles) {
    fs.copyFileSync(path.join(srcDir, file), path.join(distDir, file));
  }

  const rendererDir = path.join(distDir, "renderer");
  fs.mkdirSync(rendererDir, { recursive: true });
  fs.copyFileSync(
    path.join(srcDir, "renderer-error.html"),
    path.join(rendererDir, "renderer-error.html"),
  );

  console.log(`[desktop] Built ${entryFiles.join(", ")} into dist/`);
}

if (require.main === module) {
  build();
}

module.exports = { build, entryFiles };
