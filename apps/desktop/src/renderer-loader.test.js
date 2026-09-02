"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const { resolveRendererTarget } = require("./renderer-loader");

test("packaged desktop resolves the bundled renderer entrypoint", () => {
  const target = resolveRendererTarget({
    isPackaged: true,
    rendererRoot: "/app/resources/renderer",
    rendererUrl: "http://localhost:8081",
    allowDevRenderer: false,
  });

  assert.deepEqual(target, {
    kind: "packaged-file",
    path: path.join("/app/resources/renderer", "index.html"),
  });
});

test("development resolves the explicit local renderer server", () => {
  const target = resolveRendererTarget({
    isPackaged: false,
    rendererRoot: "/app/resources/renderer",
    rendererUrl: "http://localhost:8081",
    allowDevRenderer: true,
  });

  assert.deepEqual(target, {
    kind: "dev-url",
    url: "http://localhost:8081",
  });
});

test("packaged development override is opt-in", () => {
  const target = resolveRendererTarget({
    isPackaged: true,
    rendererRoot: "/app/resources/renderer",
    rendererUrl: "http://localhost:8081",
    allowDevRenderer: true,
  });

  assert.deepEqual(target, {
    kind: "dev-url",
    url: "http://localhost:8081",
  });
});
