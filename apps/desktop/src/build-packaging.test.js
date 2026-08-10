const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { entryFiles } = require("../scripts/build.cjs");

test("desktop build includes runtime modules required by main", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const localRequires = [
    ...mainSource.matchAll(/require\([\"'](\.\/[^\"']+)[\"']\)/g),
  ].map(([, modulePath]) => `${path.basename(modulePath)}.js`);

  for (const file of localRequires) {
    assert.ok(entryFiles.includes(file), `missing ${file} from desktop build`);
  }
});

test("sandboxed preload has no relative runtime imports", () => {
  const preloadSource = fs.readFileSync(
    path.join(__dirname, "preload.js"),
    "utf8",
  );

  assert.doesNotMatch(preloadSource, /require\([\"']\.\//);
});
