const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
const entryFiles = ["main.js", "preload.js"];

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const file of entryFiles) {
  fs.copyFileSync(path.join(srcDir, file), path.join(distDir, file));
}

console.log(`[desktop] Built ${entryFiles.join(", ")} into dist/`);
