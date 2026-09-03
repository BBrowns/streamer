const assert = require("node:assert/strict");
const test = require("node:test");

const {
  rewriteRendererAssetPathsForFileProtocol,
} = require("./build-renderer.cjs");

test("renderer entrypoint uses file-relative assets", () => {
  const input = [
    '<link rel="stylesheet" href="/_expo/static/css/app.css">',
    '<script src="/_expo/static/js/app.js"></script>',
    '<link rel="icon" href="/favicon.ico">',
    '<link rel="alternate" href="https://example.test/feed">',
  ].join("\n");

  assert.equal(
    rewriteRendererAssetPathsForFileProtocol(input),
    [
      '<link rel="stylesheet" href="./_expo/static/css/app.css">',
      '<script src="./_expo/static/js/app.js"></script>',
      '<link rel="icon" href="./favicon.ico">',
      '<link rel="alternate" href="https://example.test/feed">',
    ].join("\n"),
  );
});
